import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, agentWalletsTable, fiberChannelsTable, auditLogTable } from "@workspace/db";
import {
  ListFiberChannelsParams,
  ListFiberChannelsResponse,
  OpenFiberChannelParams,
  OpenFiberChannelBody,
  CloseFiberChannelParams,
  CloseFiberChannelResponse,
  FiberPayParams,
  FiberPayBody,
  FiberPayResponse,
} from "@workspace/api-zod";
import { checkSafetyRules } from "../lib/safety-checker";

const router: IRouter = Router();

function formatChannel(c: typeof fiberChannelsTable.$inferSelect) {
  return {
    id: c.id,
    walletId: c.walletId,
    channelId: c.channelId ?? null,
    peerAddress: c.peerAddress,
    localCapacityShannons: c.localCapacityShannons,
    remoteCapacityShannons: c.remoteCapacityShannons ?? null,
    status: c.status,
    txHash: c.txHash ?? null,
    createdAt: c.createdAt.toISOString(),
  };
}

// GET /wallets/:id/fiber/channels
router.get("/wallets/:id/fiber/channels", async (req, res): Promise<void> => {
  const params = ListFiberChannelsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const channels = await db
    .select()
    .from(fiberChannelsTable)
    .where(eq(fiberChannelsTable.walletId, params.data.id))
    .orderBy(fiberChannelsTable.createdAt);
  res.json(ListFiberChannelsResponse.parse(channels.map(formatChannel)));
});

// POST /wallets/:id/fiber/channels
router.post("/wallets/:id/fiber/channels", async (req, res): Promise<void> => {
  const params = OpenFiberChannelParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = OpenFiberChannelBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [wallet] = await db.select().from(agentWalletsTable).where(eq(agentWalletsTable.id, params.data.id));
  if (!wallet) {
    res.status(404).json({ error: "Wallet not found" });
    return;
  }

  const check = await checkSafetyRules(
    wallet.id,
    wallet.isKilled,
    "fiber_open",
    body.data.localCapacityShannons,
  );
  if (!check.allowed) {
    res.status(400).json({ error: check.reason });
    return;
  }

  const [channel] = await db
    .insert(fiberChannelsTable)
    .values({
      walletId: wallet.id,
      peerAddress: body.data.peerAddress,
      localCapacityShannons: body.data.localCapacityShannons,
      status: "pending",
    })
    .returning();

  await db.insert(auditLogTable).values({
    walletId: wallet.id,
    action: "fiber_open",
    amountShannons: body.data.localCapacityShannons,
    status: "success",
    details: { peerAddress: body.data.peerAddress, channelDbId: channel.id },
  });

  res.status(201).json(formatChannel(channel));
});

// DELETE /wallets/:id/fiber/channels/:channelId
router.delete("/wallets/:id/fiber/channels/:channelId", async (req, res): Promise<void> => {
  const params = CloseFiberChannelParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [channel] = await db
    .update(fiberChannelsTable)
    .set({ status: "closing" })
    .where(
      and(
        eq(fiberChannelsTable.id, params.data.channelId),
        eq(fiberChannelsTable.walletId, params.data.id),
      ),
    )
    .returning();

  if (!channel) {
    res.status(404).json({ error: "Channel not found" });
    return;
  }

  await db.insert(auditLogTable).values({
    walletId: params.data.id,
    action: "fiber_close",
    status: "success",
    details: { channelDbId: channel.id },
  });

  res.json(CloseFiberChannelResponse.parse(formatChannel(channel)));
});

// POST /wallets/:id/fiber/pay
router.post("/wallets/:id/fiber/pay", async (req, res): Promise<void> => {
  const params = FiberPayParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = FiberPayBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [wallet] = await db.select().from(agentWalletsTable).where(eq(agentWalletsTable.id, params.data.id));
  if (!wallet) {
    res.status(404).json({ error: "Wallet not found" });
    return;
  }

  const check = await checkSafetyRules(wallet.id, wallet.isKilled, "fiber_pay", body.data.amountShannons);
  if (!check.allowed) {
    res.status(400).json({ error: check.reason });
    return;
  }

  const paymentHash = "0x" + Array.from({ length: 32 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, "0")).join("");

  await db.insert(auditLogTable).values({
    walletId: wallet.id,
    action: "fiber_pay",
    amountShannons: body.data.amountShannons,
    txHash: paymentHash,
    status: "success",
    details: { invoice: body.data.invoice },
  });

  res.json(FiberPayResponse.parse({ txHash: paymentHash, status: "pending", message: "Fiber payment queued" }));
});

export default router;
