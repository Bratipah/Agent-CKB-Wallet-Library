/**
 * Fiber Network RPC client.
 *
 * Connects to a local or remote Fiber node via JSON-RPC.
 * Configure via FIBER_RPC_URL environment variable (default: http://127.0.0.1:8227).
 *
 * Fiber docs: https://www.fiber.world/docs
 * RPC spec:   https://github.com/nervosnetwork/fiber/blob/main/src/rpc/README.md
 */
import { logger } from "./logger.js";

function getFiberRpcUrl(): string {
  return process.env.FIBER_RPC_URL ?? "";
}

export function isFiberConfigured(): boolean {
  return !!process.env.FIBER_RPC_URL;
}

async function fiberRpcCall<T = unknown>(method: string, params: unknown[]): Promise<T> {
  const url = getFiberRpcUrl();
  if (!url) {
    throw new Error("FIBER_RPC_URL is not set. Configure your Fiber node URL to use Fiber features.");
  }

  const body = JSON.stringify({ id: 1, jsonrpc: "2.0", method, params });
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(20000),
    });
  } catch (err) {
    logger.warn({ method, err }, "Fiber RPC request failed (network error)");
    throw new Error(`Fiber node unreachable at ${url}: ${String(err)}`);
  }

  if (!resp.ok) throw new Error(`Fiber RPC HTTP ${resp.status}`);
  const json = (await resp.json()) as { result?: T; error?: { code: number; message: string } };
  if (json.error) throw new Error(`Fiber RPC error ${json.error.code}: ${json.error.message}`);
  return json.result as T;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FiberNodeInfo {
  node_name: string;
  peer_id: string;
  addresses: string[];
  version: string;
}

export interface FiberChannel {
  channel_id: string;
  peer_id: string;
  state: { state_name: string; state_flags: string[] };
  local_balance: string;
  offered_tlc_balance: string;
  remote_balance: string;
  received_tlc_balance: string;
  funding_udt_type_script: unknown;
  is_public: boolean;
  created_at: string;
}

export interface FiberOpenChannelResult {
  temporary_channel_id: string;
}

export interface FiberInvoice {
  invoice_address: string;
  invoice: {
    currency: string;
    amount: string;
    signature: string;
    data: {
      timestamp: string;
      payment_hash: string;
      attrs: unknown[];
    };
  };
}

export interface FiberPaymentResult {
  payment_hash: string;
  status: string;
  created_at: string;
  last_updated_at: string;
  failed_error?: string;
  fee: string;
}

// ─── Node info ────────────────────────────────────────────────────────────────

export async function getFiberNodeInfo(): Promise<FiberNodeInfo> {
  return fiberRpcCall<FiberNodeInfo>("node_info", [{}]);
}

// ─── Peer management ─────────────────────────────────────────────────────────

export async function connectPeer(address: string, save = false): Promise<void> {
  await fiberRpcCall("connect_peer", [{ address, save }]);
}

export async function disconnectPeer(peerId: string): Promise<void> {
  await fiberRpcCall("disconnect_peer", [{ peer_id: peerId }]);
}

// ─── Channels ────────────────────────────────────────────────────────────────

/**
 * Open a payment channel with a peer.
 * @param peerId - The peer's p2p node id (from their multiaddr /p2p/<peerId>)
 * @param fundingAmountShannons - How much CKB to lock in the channel (in shannons)
 * @param isPublic - Whether to announce the channel to the network
 */
export async function openChannel(
  peerId: string,
  fundingAmountShannons: string,
  isPublic = true,
): Promise<FiberOpenChannelResult> {
  return fiberRpcCall<FiberOpenChannelResult>("open_channel", [
    {
      peer_id: peerId,
      funding_amount: `0x${BigInt(fundingAmountShannons).toString(16)}`,
      public: isPublic,
    },
  ]);
}

/**
 * Close a channel cooperatively.
 */
export async function closeChannel(channelId: string, force = false): Promise<void> {
  await fiberRpcCall("shutdown_channel", [
    { channel_id: channelId, close_script: null, fee_rate: "0x3fc", force },
  ]);
}

/**
 * List all channels, optionally filtered by peer.
 */
export async function listChannels(peerId?: string): Promise<FiberChannel[]> {
  const result = await fiberRpcCall<{ channels: FiberChannel[] }>("list_channels", [
    { peer_id: peerId ?? null },
  ]);
  return result.channels ?? [];
}

// ─── Payments ────────────────────────────────────────────────────────────────

/**
 * Create a new invoice for receiving a payment.
 * @param amountShannons - Amount in shannons (CKB * 1e8)
 * @param description - Optional payment description
 * @param expirySecs - Invoice expiry in seconds (default 3600)
 */
export async function newInvoice(
  amountShannons: string,
  description?: string,
  expirySecs = 3600,
): Promise<FiberInvoice> {
  return fiberRpcCall<FiberInvoice>("new_invoice", [
    {
      amount: `0x${BigInt(amountShannons).toString(16)}`,
      currency: "Fibt", // testnet currency
      description: description ?? "CKB Agent payment",
      expiry: `0x${expirySecs.toString(16)}`,
      hash_algorithm: "sha256",
    },
  ]);
}

/**
 * Send a payment using a Fiber invoice.
 */
export async function sendPayment(invoice: string, timeoutSecs = 30): Promise<FiberPaymentResult> {
  return fiberRpcCall<FiberPaymentResult>("send_payment", [
    { invoice, timeout: timeoutSecs },
  ]);
}

/**
 * Get the status of a payment by its hash.
 */
export async function getPayment(paymentHash: string): Promise<FiberPaymentResult> {
  return fiberRpcCall<FiberPaymentResult>("get_payment", [{ payment_hash: paymentHash }]);
}

/**
 * Extract peer_id from a Fiber multiaddr.
 * e.g. /ip4/1.2.3.4/tcp/8228/p2p/QmXXX → QmXXX
 */
export function extractPeerIdFromAddress(address: string): string {
  const parts = address.split("/p2p/");
  if (parts.length >= 2) return parts[parts.length - 1].trim();
  // Could be just a peer_id
  return address.trim();
}
