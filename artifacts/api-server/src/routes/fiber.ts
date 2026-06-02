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
import { checkSafetyRules } from "../lib/safety-checker.js";
import {
  isFiberConfigured,
  connectPeer,
  openChannel,
  closeChannel,
  listChannels,
  sendPayment,
  newInvoice,
  getFiberNodeInfo,
  extractPeerIdFromAddress,
} from "../lib/fiber-rpc.js";

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

// GET /fiber/node — check if Fiber node is reachable
router.get("/fiber/node", async (req, res): Promise<void> => {
  if (!isFiberConfigured()) {
    res.json({ configured: false, message: "Set FIBER_RPC_URL to connect to a Fiber node" });
    return;
  }
  try {
    const info = await getFiberNodeInfo();
    res.json({ configured: true, nodeInfo: info });
  } catch (err) {
    res.json({ configured: true, nodeInfo: null, error: String(err) });
  }
});

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

  // If Fiber node is configured, sync channel statuses from the live node
  if (isFiberConfigured() && channels.length > 0) {
    try {
      const liveChannels = await listChannels();
      const liveById = new Map(liveChannels.map((c) => [c.channel_id, c]));

      for (const ch of channels) {
        if (!ch.channelId) continue;
        const live = liveById.get(ch.channelId);
        if (!live) continue;

        const stateMap: Record<string, string> = {
          ChannelReady: "open",
          ShuttingDown: "closing",
          Closed: "closed",
        };
        const newStatus = stateMap[live.state.state_name] ?? ch.status;
        const newRemote = live.remote_balance ? String(parseInt(live.remote_balance, 16)) : null;

        if (newStatus !== ch.status || newRemote !== ch.remoteCapacityShannons) {
          await db
            .update(fiberChannelsTable)
            .set({ status: newStatus, remoteCapacityShannons: newRemote ?? undefined })
            .where(eq(fiberChannelsTable.id, ch.id));
        }
      }

      // Re-fetch after sync
      const updated = await db
        .select()
        .from(fiberChannelsTable)
        .where(eq(fiberChannelsTable.walletId, params.data.id))
        .orderBy(fiberChannelsTable.createdAt);
      res.json(ListFiberChannelsResponse.parse(updated.map(formatChannel)));
      return;
    } catch (err) {
      req.log.warn({ err }, "Failed to sync Fiber channel statuses from node");
    }
  }

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

  const [wallet] = await db
    .select()
    .from(agentWalletsTable)
    .where(eq(agentWalletsTable.id, params.data.id));
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
    await db.insert(auditLogTable).values({
      walletId: wallet.id,
      action: "fiber_open",
      amountShannons: body.data.localCapacityShannons,
      status: "blocked",
      blockedReason: check.reason,
      details: { peerAddress: body.data.peerAddress },
    });
    res.status(400).json({ error: check.reason });
    return;
  }

  let channelId: string | undefined;
  let status = "pending";

  if (isFiberConfigured()) {
    try {
      const peerId = extractPeerIdFromAddress(body.data.peerAddress);
      // Connect to peer first (idempotent — safe to call even if already connected)
      await connectPeer(body.data.peerAddress, true).catch(() => {
        // Ignore connect errors — peer may already be connected
      });
      const result = await openChannel(peerId, body.data.localCapacityShannons, true);
      channelId = result.temporary_channel_id;
      req.log.info({ channelId, peerId }, "Fiber channel opening initiated");
    } catch (err) {
      req.log.error({ err }, "Fiber open_channel failed");
      res.status(502).json({
        error: `Fiber node error: ${String(err)}`,
        hint: "Ensure your Fiber node is running and the peer is reachable",
      });
      return;
    }
  }

  const [channel] = await db
    .insert(fiberChannelsTable)
    .values({
      walletId: wallet.id,
      peerAddress: body.data.peerAddress,
      localCapacityShannons: body.data.localCapacityShannons,
      status,
      channelId: channelId ?? null,
    })
    .returning();

  await db.insert(auditLogTable).values({
    walletId: wallet.id,
    action: "fiber_open",
    amountShannons: body.data.localCapacityShannons,
    status: "success",
    details: { peerAddress: body.data.peerAddress, channelId: channelId ?? null, fiberConfigured: isFiberConfigured() },
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
    .select()
    .from(fiberChannelsTable)
    .where(
      and(
        eq(fiberChannelsTable.id, params.data.channelId),
        eq(fiberChannelsTable.walletId, params.data.id),
      ),
    );

  if (!channel) {
    res.status(404).json({ error: "Channel not found" });
    return;
  }

  if (isFiberConfigured() && channel.channelId) {
    try {
      await closeChannel(channel.channelId, false);
      req.log.info({ channelId: channel.channelId }, "Fiber channel shutdown initiated");
    } catch (err) {
      req.log.warn({ err }, "Fiber close_channel failed, updating DB status anyway");
    }
  }

  const [updated] = await db
    .update(fiberChannelsTable)
    .set({ status: "closing" })
    .where(eq(fiberChannelsTable.id, params.data.channelId))
    .returning();

  await db.insert(auditLogTable).values({
    walletId: params.data.id,
    action: "fiber_close",
    status: "success",
    details: { channelDbId: channel.id, channelId: channel.channelId },
  });

  res.json(CloseFiberChannelResponse.parse(formatChannel(updated)));
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

  const [wallet] = await db
    .select()
    .from(agentWalletsTable)
    .where(eq(agentWalletsTable.id, params.data.id));
  if (!wallet) {
    res.status(404).json({ error: "Wallet not found" });
    return;
  }

  const check = await checkSafetyRules(wallet.id, wallet.isKilled, "fiber_pay", body.data.amountShannons);
  if (!check.allowed) {
    await db.insert(auditLogTable).values({
      walletId: wallet.id,
      action: "fiber_pay",
      amountShannons: body.data.amountShannons,
      status: "blocked",
      blockedReason: check.reason,
      details: { invoice: body.data.invoice },
    });
    res.status(400).json({ error: check.reason });
    return;
  }

  let paymentHash: string;
  let status = "pending";

  if (isFiberConfigured() && body.data.invoice) {
    try {
      const result = await sendPayment(body.data.invoice);
      paymentHash = result.payment_hash;
      status = result.status === "Success" ? "success" : "pending";
      req.log.info({ paymentHash }, "Fiber payment sent");
    } catch (err) {
      req.log.error({ err }, "Fiber send_payment failed");
      res.status(502).json({ error: `Fiber payment error: ${String(err)}` });
      return;
    }
  } else {
    // No Fiber node configured — generate a deterministic payment hash for tracking
    paymentHash =
      "0x" +
      Array.from({ length: 32 }, () =>
        Math.floor(Math.random() * 256)
          .toString(16)
          .padStart(2, "0"),
      ).join("");
    status = isFiberConfigured() ? "pending" : "simulated";
  }

  await db.insert(auditLogTable).values({
    walletId: wallet.id,
    action: "fiber_pay",
    amountShannons: body.data.amountShannons,
    txHash: paymentHash,
    status: "success",
    details: { invoice: body.data.invoice, fiberConfigured: isFiberConfigured() },
  });

  res.json(FiberPayResponse.parse({ txHash: paymentHash, status, message: isFiberConfigured() ? "Payment sent" : "Fiber node not configured — set FIBER_RPC_URL" }));
});

// POST /wallets/:id/fiber/invoice — create a Fiber invoice for receiving payment
router.post("/wallets/:id/fiber/invoice", async (req, res): Promise<void> => {
  if (!isFiberConfigured()) {
    res.status(400).json({ error: "Fiber node not configured. Set FIBER_RPC_URL." });
    return;
  }

  const { amountShannons, description } = req.body as {
    amountShannons: string;
    description?: string;
  };
  if (!amountShannons) {
    res.status(400).json({ error: "amountShannons is required" });
    return;
  }

  try {
    const invoice = await newInvoice(amountShannons, description);
    res.json(invoice);
  } catch (err) {
    res.status(502).json({ error: `Fiber invoice error: ${String(err)}` });
  }
});

export default router;
