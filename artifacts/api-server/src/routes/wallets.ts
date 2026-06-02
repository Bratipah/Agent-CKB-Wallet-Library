import { Router, type IRouter } from "express";
import { eq, count, and } from "drizzle-orm";
import {
  db,
  agentWalletsTable,
  safetyRulesTable,
  auditLogTable,
  fiberChannelsTable,
  dobAssetsTable,
} from "@workspace/db";
import {
  GetWalletParams,
  GetWalletResponse,
  ListWalletsResponse,
  CreateWalletBody,
  DeleteWalletParams,
  GetWalletBalanceParams,
  GetWalletBalanceResponse,
  GetStatsResponse,
  ActivateKillSwitchParams,
  ActivateKillSwitchResponse,
  RestoreWalletParams,
  RestoreWalletResponse,
} from "@workspace/api-zod";
import { generateWallet, addressToLockArgs, buildLockScript } from "../lib/ckb-wallet";
import { getLiveCells, getCellsCapacity } from "../lib/ckb-rpc";

const router: IRouter = Router();

// GET /wallets
router.get("/wallets", async (_req, res): Promise<void> => {
  const wallets = await db.select().from(agentWalletsTable).orderBy(agentWalletsTable.createdAt);
  res.json(
    ListWalletsResponse.parse(
      wallets.map((w) => ({
        ...w,
        status: w.isKilled ? "killed" : "active",
        createdAt: w.createdAt.toISOString(),
        updatedAt: w.updatedAt.toISOString(),
      })),
    ),
  );
});

// POST /wallets
router.post("/wallets", async (req, res): Promise<void> => {
  const parsed = CreateWalletBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { name, network, passphrase } = parsed.data;
  const generated = generateWallet(network as "mainnet" | "testnet", passphrase ?? undefined);

  const [wallet] = await db
    .insert(agentWalletsTable)
    .values({
      name,
      address: generated.address,
      publicKey: generated.publicKeyHex,
      encryptedPrivateKey: generated.encryptedPrivateKey,
      network,
    })
    .returning();

  // Create default safety rules for new wallet
  await db.insert(safetyRulesTable).values({
    walletId: wallet.id,
    allowedActions: ["transfer", "sign", "fiber_open", "fiber_pay", "dob_mint", "otx_compose"],
    addressWhitelist: [],
    isActive: true,
  });

  await db.insert(auditLogTable).values({
    walletId: wallet.id,
    action: "wallet_created",
    status: "success",
    details: { name, network, address: generated.address },
  });

  res.status(201).json(
    GetWalletResponse.parse({
      ...wallet,
      status: "active",
      createdAt: wallet.createdAt.toISOString(),
      updatedAt: wallet.updatedAt.toISOString(),
    }),
  );
});

// GET /wallets/:id
router.get("/wallets/:id", async (req, res): Promise<void> => {
  const params = GetWalletParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [wallet] = await db.select().from(agentWalletsTable).where(eq(agentWalletsTable.id, params.data.id));
  if (!wallet) {
    res.status(404).json({ error: "Wallet not found" });
    return;
  }
  res.json(
    GetWalletResponse.parse({
      ...wallet,
      status: wallet.isKilled ? "killed" : "active",
      createdAt: wallet.createdAt.toISOString(),
      updatedAt: wallet.updatedAt.toISOString(),
    }),
  );
});

// DELETE /wallets/:id
router.delete("/wallets/:id", async (req, res): Promise<void> => {
  const params = DeleteWalletParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [wallet] = await db.delete(agentWalletsTable).where(eq(agentWalletsTable.id, params.data.id)).returning();
  if (!wallet) {
    res.status(404).json({ error: "Wallet not found" });
    return;
  }
  res.sendStatus(204);
});

// GET /wallets/:id/balance
router.get("/wallets/:id/balance", async (req, res): Promise<void> => {
  const params = GetWalletBalanceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [wallet] = await db.select().from(agentWalletsTable).where(eq(agentWalletsTable.id, params.data.id));
  if (!wallet) {
    res.status(404).json({ error: "Wallet not found" });
    return;
  }

  const lockArgs = addressToLockArgs(wallet.address);
  const lockScript = buildLockScript(lockArgs);
  const [cells, capacityHex] = await Promise.all([
    getLiveCells(wallet.network, lockScript, 100),
    getCellsCapacity(wallet.network, lockScript),
  ]);

  const totalCapacity = BigInt(capacityHex).toString();
  // Free capacity = total - cells that have type scripts (locked in type scripts)
  const freeCells = cells.filter((c) => !c.output.type);
  const freeCapacity = freeCells.reduce((s, c) => s + BigInt(c.output.capacity), BigInt(0)).toString();

  res.json(
    GetWalletBalanceResponse.parse({
      walletId: wallet.id,
      address: wallet.address,
      totalCapacity,
      freeCapacity,
      cellCount: cells.length,
    }),
  );
});

// POST /wallets/:id/kill
router.post("/wallets/:id/kill", async (req, res): Promise<void> => {
  const params = ActivateKillSwitchParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [wallet] = await db
    .update(agentWalletsTable)
    .set({ isKilled: true })
    .where(eq(agentWalletsTable.id, params.data.id))
    .returning();
  if (!wallet) {
    res.status(404).json({ error: "Wallet not found" });
    return;
  }
  await db.insert(auditLogTable).values({
    walletId: wallet.id,
    action: "kill_switch_activated",
    status: "success",
    details: {},
  });
  res.json(
    ActivateKillSwitchResponse.parse({
      ...wallet,
      status: "killed",
      createdAt: wallet.createdAt.toISOString(),
      updatedAt: wallet.updatedAt.toISOString(),
    }),
  );
});

// POST /wallets/:id/restore
router.post("/wallets/:id/restore", async (req, res): Promise<void> => {
  const params = RestoreWalletParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [wallet] = await db
    .update(agentWalletsTable)
    .set({ isKilled: false })
    .where(eq(agentWalletsTable.id, params.data.id))
    .returning();
  if (!wallet) {
    res.status(404).json({ error: "Wallet not found" });
    return;
  }
  await db.insert(auditLogTable).values({
    walletId: wallet.id,
    action: "kill_switch_restored",
    status: "success",
    details: {},
  });
  res.json(
    RestoreWalletResponse.parse({
      ...wallet,
      status: "active",
      createdAt: wallet.createdAt.toISOString(),
      updatedAt: wallet.updatedAt.toISOString(),
    }),
  );
});

// GET /stats
router.get("/stats", async (_req, res): Promise<void> => {
  const [walletsResult, killedResult, totalTxResult, blockedTxResult, openChannelsResult, mintedDobsResult] =
    await Promise.all([
      db.select({ count: count() }).from(agentWalletsTable),
      db.select({ count: count() }).from(agentWalletsTable).where(eq(agentWalletsTable.isKilled, true)),
      db.select({ count: count() }).from(auditLogTable),
      db.select({ count: count() }).from(auditLogTable).where(eq(auditLogTable.status, "blocked")),
      db
        .select({ count: count() })
        .from(fiberChannelsTable)
        .where(eq(fiberChannelsTable.status, "open")),
      db.select({ count: count() }).from(dobAssetsTable).where(eq(dobAssetsTable.status, "minted")),
    ]);

  const totalWallets = walletsResult[0]?.count ?? 0;
  const killedWallets = killedResult[0]?.count ?? 0;

  res.json(
    GetStatsResponse.parse({
      totalWallets,
      activeWallets: totalWallets - killedWallets,
      killedWallets,
      totalTransactions: totalTxResult[0]?.count ?? 0,
      blockedTransactions: blockedTxResult[0]?.count ?? 0,
      openChannels: openChannelsResult[0]?.count ?? 0,
      mintedDobs: mintedDobsResult[0]?.count ?? 0,
    }),
  );
});

export default router;
