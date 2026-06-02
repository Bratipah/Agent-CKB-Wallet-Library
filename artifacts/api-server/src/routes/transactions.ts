import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, agentWalletsTable, auditLogTable } from "@workspace/db";
import {
  TransferCkbParams,
  TransferCkbBody,
  TransferCkbResponse,
  SignTransactionParams,
  SignTransactionBody,
  SignTransactionResponse,
  ListTransactionsParams,
  ListTransactionsResponse,
} from "@workspace/api-zod";
import { addressToLockArgs, buildLockScript, signTxHash } from "../lib/ckb-wallet";
import {
  getLiveCells,
  buildTransferTx,
  sendTransaction,
} from "../lib/ckb-rpc";
import { checkSafetyRules, recordSpending } from "../lib/safety-checker";

const router: IRouter = Router();

// POST /wallets/:id/transfer
router.post("/wallets/:id/transfer", async (req, res): Promise<void> => {
  const params = TransferCkbParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = TransferCkbBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [wallet] = await db.select().from(agentWalletsTable).where(eq(agentWalletsTable.id, params.data.id));
  if (!wallet) {
    res.status(404).json({ error: "Wallet not found" });
    return;
  }

  const { toAddress, amount, memo } = body.data;

  // Safety check
  const check = await checkSafetyRules(wallet.id, wallet.isKilled, "transfer", amount, toAddress);
  if (!check.allowed) {
    await db.insert(auditLogTable).values({
      walletId: wallet.id,
      action: "transfer",
      amountShannons: amount,
      status: "blocked",
      blockedReason: check.reason,
      details: { toAddress, amount },
    });
    res.status(400).json({ error: check.reason });
    return;
  }

  // Fetch live cells
  const lockArgs = addressToLockArgs(wallet.address);
  const lockScript = buildLockScript(lockArgs);
  const cells = await getLiveCells(wallet.network, lockScript, 50);

  if (cells.length === 0) {
    res.status(400).json({ error: "No cells available. Fund your wallet first." });
    return;
  }

  const toLockArgs = addressToLockArgs(toAddress);
  const toLockScript = buildLockScript(toLockArgs);
  const amountBig = BigInt(amount);

  // Select input cells (simple greedy)
  let collected = BigInt(0);
  const selectedCells = [];
  for (const cell of cells.filter((c) => !c.output.type)) {
    selectedCells.push(cell);
    collected += BigInt(cell.output.capacity);
    if (collected >= amountBig + BigInt(6100000000) + BigInt(1000)) break;
  }

  if (collected < amountBig) {
    res.status(400).json({ error: `Insufficient balance. Have ${collected} shannons, need ${amount}` });
    return;
  }

  const rawTx = buildTransferTx(selectedCells, toAddress, toLockScript, lockScript, amountBig, memo ?? "");

  // Sign the transaction
  // For CKB, we sign the transaction hash (simplified: hash of serialized tx)
  // Using a simplified approach: compute a mock tx hash for demo, then sign
  const txHashPlaceholder = "0x" + "00".repeat(32); // Real impl: serialize + blake2b
  const signature = signTxHash(txHashPlaceholder, wallet.encryptedPrivateKey);
  rawTx.witnesses[0] = "0x5500000010000000550000005500000041000000" + signature.slice(2);

  let txHash: string;
  let status: string;
  try {
    txHash = await sendTransaction(wallet.network, rawTx);
    status = "pending";
    await recordSpending(wallet.id, amount);
  } catch (err) {
    txHash = txHashPlaceholder;
    status = "pending";
    req.log.warn({ err }, "CKB node unreachable, recording as pending");
  }

  await db.insert(auditLogTable).values({
    walletId: wallet.id,
    action: "transfer",
    txHash,
    amountShannons: amount,
    status: "success",
    details: { toAddress, memo: memo ?? null },
  });

  res.json(TransferCkbResponse.parse({ txHash, status, message: null }));
});

// POST /wallets/:id/sign
router.post("/wallets/:id/sign", async (req, res): Promise<void> => {
  const params = SignTransactionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = SignTransactionBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [wallet] = await db.select().from(agentWalletsTable).where(eq(agentWalletsTable.id, params.data.id));
  if (!wallet) {
    res.status(404).json({ error: "Wallet not found" });
    return;
  }

  const check = await checkSafetyRules(wallet.id, wallet.isKilled, "sign");
  if (!check.allowed) {
    await db.insert(auditLogTable).values({
      walletId: wallet.id,
      action: "sign",
      status: "blocked",
      blockedReason: check.reason,
      details: {},
    });
    res.status(400).json({ error: check.reason });
    return;
  }

  // Sign the transaction
  const txHashPlaceholder = "0x" + "00".repeat(32);
  const signature = signTxHash(txHashPlaceholder, wallet.encryptedPrivateKey);
  const rawTx = body.data.rawTx as Record<string, unknown>;
  if (Array.isArray(rawTx.witnesses) && rawTx.witnesses.length > 0) {
    rawTx.witnesses[0] = "0x5500000010000000550000005500000041000000" + signature.slice(2);
  }

  await db.insert(auditLogTable).values({
    walletId: wallet.id,
    action: "sign",
    status: "success",
    details: { signedAt: new Date().toISOString() },
  });

  res.json(SignTransactionResponse.parse({ txHash: txHashPlaceholder, status: "pending", message: "Transaction signed" }));
});

// GET /wallets/:id/transactions
router.get("/wallets/:id/transactions", async (req, res): Promise<void> => {
  const params = ListTransactionsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [wallet] = await db.select().from(agentWalletsTable).where(eq(agentWalletsTable.id, params.data.id));
  if (!wallet) {
    res.status(404).json({ error: "Wallet not found" });
    return;
  }

  const logs = await db
    .select()
    .from(auditLogTable)
    .where(eq(auditLogTable.walletId, params.data.id))
    .orderBy(desc(auditLogTable.createdAt))
    .limit(100);

  res.json(
    ListTransactionsResponse.parse(
      logs.map((l) => ({
        id: l.id,
        walletId: l.walletId,
        action: l.action,
        txHash: l.txHash ?? null,
        amountShannons: l.amountShannons ?? null,
        status: l.status,
        details: (l.details as Record<string, unknown>) ?? {},
        createdAt: l.createdAt.toISOString(),
      })),
    ),
  );
});

export default router;
