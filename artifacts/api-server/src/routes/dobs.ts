import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, agentWalletsTable, dobAssetsTable, auditLogTable } from "@workspace/db";
import {
  ListDobsParams,
  ListDobsResponse,
  MintDobParams,
  MintDobBody,
} from "@workspace/api-zod";
import { checkSafetyRules } from "../lib/safety-checker";

const router: IRouter = Router();

function formatDob(d: typeof dobAssetsTable.$inferSelect) {
  return {
    id: d.id,
    walletId: d.walletId,
    tokenId: d.tokenId ?? null,
    name: d.name,
    description: d.description ?? null,
    contentType: d.contentType ?? null,
    content: d.content ?? null,
    clusterName: d.clusterName ?? null,
    txHash: d.txHash ?? null,
    status: d.status,
    createdAt: d.createdAt.toISOString(),
  };
}

// GET /wallets/:id/dobs
router.get("/wallets/:id/dobs", async (req, res): Promise<void> => {
  const params = ListDobsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const dobs = await db
    .select()
    .from(dobAssetsTable)
    .where(eq(dobAssetsTable.walletId, params.data.id))
    .orderBy(dobAssetsTable.createdAt);
  res.json(ListDobsResponse.parse(dobs.map(formatDob)));
});

// POST /wallets/:id/dobs
router.post("/wallets/:id/dobs", async (req, res): Promise<void> => {
  const params = MintDobParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = MintDobBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [wallet] = await db.select().from(agentWalletsTable).where(eq(agentWalletsTable.id, params.data.id));
  if (!wallet) {
    res.status(404).json({ error: "Wallet not found" });
    return;
  }

  const check = await checkSafetyRules(wallet.id, wallet.isKilled, "dob_mint");
  if (!check.allowed) {
    res.status(400).json({ error: check.reason });
    return;
  }

  // Generate a token ID (in real impl this would be the on-chain cell type_id)
  const tokenId =
    "0x" +
    Array.from({ length: 32 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, "0")).join("");
  const txHash =
    "0x" +
    Array.from({ length: 32 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, "0")).join("");

  const [dob] = await db
    .insert(dobAssetsTable)
    .values({
      walletId: wallet.id,
      tokenId,
      name: body.data.name,
      description: body.data.description ?? null,
      contentType: body.data.contentType ?? null,
      content: body.data.content ?? null,
      clusterName: body.data.clusterName ?? null,
      txHash,
      status: "minted",
    })
    .returning();

  await db.insert(auditLogTable).values({
    walletId: wallet.id,
    action: "dob_mint",
    txHash,
    status: "success",
    details: { name: body.data.name, tokenId },
  });

  res.status(201).json(formatDob(dob));
});

export default router;
