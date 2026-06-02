import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, agentWalletsTable, otxIntentsTable, auditLogTable } from "@workspace/db";
import {
  ListOtxIntentsParams,
  ListOtxIntentsResponse,
  ComposeOtxIntentParams,
  ComposeOtxIntentBody,
  FinalizeOtxIntentParams,
  FinalizeOtxIntentResponse,
} from "@workspace/api-zod";
import { checkSafetyRules } from "../lib/safety-checker";

const router: IRouter = Router();

function formatIntent(i: typeof otxIntentsTable.$inferSelect) {
  return {
    id: i.id,
    walletId: i.walletId,
    intentType: i.intentType,
    intentData: (i.intentData as Record<string, unknown>) ?? {},
    status: i.status,
    txHash: i.txHash ?? null,
    createdAt: i.createdAt.toISOString(),
  };
}

// GET /wallets/:id/otx
router.get("/wallets/:id/otx", async (req, res): Promise<void> => {
  const params = ListOtxIntentsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const intents = await db
    .select()
    .from(otxIntentsTable)
    .where(eq(otxIntentsTable.walletId, params.data.id))
    .orderBy(otxIntentsTable.createdAt);
  res.json(ListOtxIntentsResponse.parse(intents.map(formatIntent)));
});

// POST /wallets/:id/otx
router.post("/wallets/:id/otx", async (req, res): Promise<void> => {
  const params = ComposeOtxIntentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = ComposeOtxIntentBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [wallet] = await db.select().from(agentWalletsTable).where(eq(agentWalletsTable.id, params.data.id));
  if (!wallet) {
    res.status(404).json({ error: "Wallet not found" });
    return;
  }

  const check = await checkSafetyRules(wallet.id, wallet.isKilled, "otx_compose");
  if (!check.allowed) {
    res.status(400).json({ error: check.reason });
    return;
  }

  const [intent] = await db
    .insert(otxIntentsTable)
    .values({
      walletId: wallet.id,
      intentType: body.data.intentType,
      intentData: body.data.intentData,
      status: "pending",
    })
    .returning();

  await db.insert(auditLogTable).values({
    walletId: wallet.id,
    action: "otx_compose",
    status: "success",
    details: { intentType: body.data.intentType, intentId: intent.id },
  });

  res.status(201).json(formatIntent(intent));
});

// POST /wallets/:id/otx/:intentId/finalize
router.post("/wallets/:id/otx/:intentId/finalize", async (req, res): Promise<void> => {
  const params = FinalizeOtxIntentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [wallet] = await db.select().from(agentWalletsTable).where(eq(agentWalletsTable.id, params.data.id));
  if (!wallet) {
    res.status(404).json({ error: "Wallet not found" });
    return;
  }

  const [existing] = await db
    .select()
    .from(otxIntentsTable)
    .where(and(eq(otxIntentsTable.id, params.data.intentId), eq(otxIntentsTable.walletId, params.data.id)));
  if (!existing) {
    res.status(404).json({ error: "Intent not found" });
    return;
  }

  const txHash =
    "0x" +
    Array.from({ length: 32 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, "0")).join("");

  const [updated] = await db
    .update(otxIntentsTable)
    .set({ status: "finalized", txHash })
    .where(eq(otxIntentsTable.id, params.data.intentId))
    .returning();

  await db.insert(auditLogTable).values({
    walletId: wallet.id,
    action: "otx_finalize",
    txHash,
    status: "success",
    details: { intentId: existing.id, intentType: existing.intentType },
  });

  res.json(FinalizeOtxIntentResponse.parse(formatIntent(updated)));
});

export default router;
