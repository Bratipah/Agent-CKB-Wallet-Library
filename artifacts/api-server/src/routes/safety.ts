import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, agentWalletsTable, safetyRulesTable } from "@workspace/db";
import {
  GetSafetyRulesParams,
  GetSafetyRulesResponse,
  UpdateSafetyRulesParams,
  UpdateSafetyRulesBody,
  UpdateSafetyRulesResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function formatRules(r: typeof safetyRulesTable.$inferSelect) {
  return {
    id: r.id,
    walletId: r.walletId,
    maxTransferAmountShannons: r.maxTransferAmountShannons ?? null,
    dailySpendingLimitShannons: r.dailySpendingLimitShannons ?? null,
    dailySpentShannons: r.dailySpentShannons ?? "0",
    allowedActions: r.allowedActions ?? [],
    addressWhitelist: r.addressWhitelist ?? [],
    isActive: r.isActive,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

// GET /wallets/:id/safety
router.get("/wallets/:id/safety", async (req, res): Promise<void> => {
  const params = GetSafetyRulesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [wallet] = await db.select().from(agentWalletsTable).where(eq(agentWalletsTable.id, params.data.id));
  if (!wallet) {
    res.status(404).json({ error: "Wallet not found" });
    return;
  }

  const [rules] = await db.select().from(safetyRulesTable).where(eq(safetyRulesTable.walletId, params.data.id));
  if (!rules) {
    // Auto-create default rules if missing
    const [created] = await db
      .insert(safetyRulesTable)
      .values({
        walletId: params.data.id,
        allowedActions: ["transfer", "sign", "fiber_open", "fiber_pay", "dob_mint", "otx_compose"],
        addressWhitelist: [],
        isActive: true,
      })
      .returning();
    res.json(GetSafetyRulesResponse.parse(formatRules(created)));
    return;
  }

  res.json(GetSafetyRulesResponse.parse(formatRules(rules)));
});

// PUT /wallets/:id/safety
router.put("/wallets/:id/safety", async (req, res): Promise<void> => {
  const params = UpdateSafetyRulesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateSafetyRulesBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [wallet] = await db.select().from(agentWalletsTable).where(eq(agentWalletsTable.id, params.data.id));
  if (!wallet) {
    res.status(404).json({ error: "Wallet not found" });
    return;
  }

  const update: Partial<typeof safetyRulesTable.$inferInsert> = {};
  if (body.data.maxTransferAmountShannons !== undefined)
    update.maxTransferAmountShannons = body.data.maxTransferAmountShannons;
  if (body.data.dailySpendingLimitShannons !== undefined)
    update.dailySpendingLimitShannons = body.data.dailySpendingLimitShannons;
  if (body.data.allowedActions !== undefined) update.allowedActions = body.data.allowedActions;
  if (body.data.addressWhitelist !== undefined) update.addressWhitelist = body.data.addressWhitelist;
  if (body.data.isActive !== undefined) update.isActive = body.data.isActive;

  const [existing] = await db.select().from(safetyRulesTable).where(eq(safetyRulesTable.walletId, params.data.id));
  if (!existing) {
    const [created] = await db
      .insert(safetyRulesTable)
      .values({ walletId: params.data.id, ...update, isActive: true })
      .returning();
    res.json(UpdateSafetyRulesResponse.parse(formatRules(created)));
    return;
  }

  const [updated] = await db
    .update(safetyRulesTable)
    .set(update)
    .where(eq(safetyRulesTable.walletId, params.data.id))
    .returning();

  res.json(UpdateSafetyRulesResponse.parse(formatRules(updated)));
});

export default router;
