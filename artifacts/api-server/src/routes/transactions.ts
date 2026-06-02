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
import { addressToLockArgs, buildLockScript, decryptPrivateKey, hexToBytes, bytesToHex } from "../lib/ckb-wallet.js";
import { getLiveCells, buildTransferTx, sendTransaction, type CkbTransaction } from "../lib/ckb-rpc.js";
import { checkSafetyRules, recordSpending } from "../lib/safety-checker.js";
import { computeTxHash, serializeWitnessArgs, computeSigningMessage } from "../lib/ckb-molecule.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";

const router: IRouter = Router();

/**
 * Sign a CKB transaction correctly:
 * 1. Compute tx_hash from molecule-serialized RawTransaction
 * 2. Build WitnessArgs placeholder (lock = 65 zero bytes)
 * 3. Compute signing message = blake2b_256(tx_hash || u64LE(witness_len) || witness_bytes)
 * 4. Sign with secp256k1, produce 65-byte recoverable sig [r(32)||s(32)||v(1)]
 * 5. Replace witness placeholder lock with actual signature
 */
function signCkbTransaction(rawTx: CkbTransaction, encryptedPrivateKey: string): CkbTransaction {
  const txHash = computeTxHash(rawTx);

  // WitnessArgs placeholder: lock = 65 zero bytes
  const lockPlaceholder = new Uint8Array(65);
  const witnessBytes = serializeWitnessArgs(lockPlaceholder);
  const signingMessage = computeSigningMessage(txHash, witnessBytes);

  // Decrypt private key and sign
  const privateKeyHex = decryptPrivateKey(encryptedPrivateKey);
  const privateKeyBytes = hexToBytes(privateKeyHex);
  const sig = secp256k1.sign(signingMessage, privateKeyBytes, { lowS: true });

  // CKB expects 65-byte signature: r(32) || s(32) || recovery_id(1)
  const sig65 = new Uint8Array(65);
  sig65.set(sig.toCompactRawBytes(), 0);
  sig65[64] = sig.recovery ?? 0;

  // Build final WitnessArgs with actual signature
  const finalWitnessBytes = serializeWitnessArgs(sig65);

  const signedTx = { ...rawTx, witnesses: [...rawTx.witnesses] };
  signedTx.witnesses[0] = bytesToHex(finalWitnessBytes);
  return signedTx;
}

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

  const [wallet] = await db
    .select()
    .from(agentWalletsTable)
    .where(eq(agentWalletsTable.id, params.data.id));
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
    res.status(400).json({
      error: "No cells found. Fund your wallet via the testnet faucet at https://faucet.nervos.org/",
    });
    return;
  }

  const toLockArgs = addressToLockArgs(toAddress);
  const toLockScript = buildLockScript(toLockArgs);
  const amountBig = BigInt(amount);

  // Select input cells (greedy — only plain cells, skip type-scripted ones)
  const MIN_CHANGE = BigInt(6100000000); // 61 CKB
  const FEE_ESTIMATE = BigInt(1000);
  let collected = BigInt(0);
  const selectedCells = [];
  for (const cell of cells.filter((c) => !c.output.type)) {
    selectedCells.push(cell);
    collected += BigInt(cell.output.capacity);
    if (collected >= amountBig + MIN_CHANGE + FEE_ESTIMATE) break;
  }

  if (collected < amountBig + FEE_ESTIMATE) {
    res.status(400).json({
      error: `Insufficient balance. Available: ${(Number(collected) / 1e8).toFixed(4)} CKB, requested: ${(Number(amountBig) / 1e8).toFixed(4)} CKB`,
    });
    return;
  }

  const rawTx = buildTransferTx(
    selectedCells,
    toAddress,
    toLockScript,
    lockScript,
    amountBig,
    memo ?? "",
  );

  // Sign with proper molecule tx hash
  const signedTx = signCkbTransaction(rawTx, wallet.encryptedPrivateKey);
  const txHash = computeTxHash(rawTx);

  let broadcastedHash: string = txHash;
  let status = "signed";

  try {
    broadcastedHash = await sendTransaction(wallet.network, signedTx);
    status = "pending";
    await recordSpending(wallet.id, amount);
    req.log.info({ txHash: broadcastedHash }, "CKB transfer broadcast");
  } catch (err) {
    req.log.warn({ err, txHash }, "CKB node rejected/unreachable, transaction signed but not broadcast");
    status = "signed_not_broadcast";
  }

  await db.insert(auditLogTable).values({
    walletId: wallet.id,
    action: "transfer",
    txHash: broadcastedHash,
    amountShannons: amount,
    status: status === "pending" ? "success" : "failed",
    details: { toAddress, memo: memo ?? null, status },
  });

  res.json(TransferCkbResponse.parse({ txHash: broadcastedHash, status, message: null }));
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

  const [wallet] = await db
    .select()
    .from(agentWalletsTable)
    .where(eq(agentWalletsTable.id, params.data.id));
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

  const rawTx = body.data.rawTx as CkbTransaction;
  const txHash = computeTxHash(rawTx);
  const signedTx = signCkbTransaction(rawTx, wallet.encryptedPrivateKey);

  await db.insert(auditLogTable).values({
    walletId: wallet.id,
    action: "sign",
    txHash,
    status: "success",
    details: { signedAt: new Date().toISOString() },
  });

  res.json(
    SignTransactionResponse.parse({
      txHash,
      status: "signed",
      message: "Transaction signed with secp256k1",
      signedTx,
    }),
  );
});

// GET /wallets/:id/transactions
router.get("/wallets/:id/transactions", async (req, res): Promise<void> => {
  const params = ListTransactionsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
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
