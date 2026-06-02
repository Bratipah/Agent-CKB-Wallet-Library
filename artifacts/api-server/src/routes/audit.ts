import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, agentWalletsTable, auditLogTable } from "@workspace/db";
import { ListAuditLogParams, ListAuditLogResponse } from "@workspace/api-zod";

const router: IRouter = Router();

// GET /wallets/:id/audit
router.get("/wallets/:id/audit", async (req, res): Promise<void> => {
  const params = ListAuditLogParams.safeParse(req.params);
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
    .limit(200);

  res.json(
    ListAuditLogResponse.parse(
      logs.map((l) => ({
        id: l.id,
        walletId: l.walletId,
        action: l.action,
        txHash: l.txHash ?? null,
        amountShannons: l.amountShannons ?? null,
        status: l.status,
        blockedReason: l.blockedReason ?? null,
        details: (l.details as Record<string, unknown>) ?? {},
        createdAt: l.createdAt.toISOString(),
      })),
    ),
  );
});

export default router;
