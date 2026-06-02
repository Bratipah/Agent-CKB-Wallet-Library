import { secp256k1 } from "@noble/curves/secp256k1.js";
import { blake2b } from "@noble/hashes/blake2.js";
import { bech32m } from "@scure/base";
import { randomBytes, createCipheriv, createDecipheriv, pbkdf2Sync, randomFillSync } from "crypto";

// CKB uses blake2b-256 (32 bytes)
function blake2b256(data: Uint8Array): Uint8Array {
  return blake2b(data, { dkLen: 32, personalization: new TextEncoder().encode("ckb-default-hash") });
}

// CKB lock args = first 20 bytes of blake2b-256(compressed pubkey)
function pubkeyToLockArgs(compressedPubKey: Uint8Array): Uint8Array {
  const hash = blake2b256(compressedPubKey);
  return hash.slice(0, 20);
}

// CKB full address format (new unified)
// payload = 0x00 (full_type) || code_hash (32 bytes) || hash_type_byte (1) || args (20 bytes)
const SECP256K1_CODE_HASH = "9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8";

function deriveCkbAddress(compressedPubKey: Uint8Array, network: "mainnet" | "testnet"): string {
  const lockArgs = pubkeyToLockArgs(compressedPubKey);
  const codeHashBytes = hexToBytes(SECP256K1_CODE_HASH);
  // 0x00 = full address format, 0x01 = type hash type
  const payload = new Uint8Array(1 + 32 + 1 + 20);
  payload[0] = 0x00;
  payload.set(codeHashBytes, 1);
  payload[33] = 0x01;
  payload.set(lockArgs, 34);
  const prefix = network === "mainnet" ? "ckb" : "ckt";
  return bech32m.encode(prefix, bech32m.toWords(payload), 1023);
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const arr = new Uint8Array(clean.length / 2);
  for (let i = 0; i < arr.length; i++) {
    arr[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return arr;
}

function bytesToHex(bytes: Uint8Array): string {
  return "0x" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// AES-256-GCM encryption/decryption for private keys
const PBKDF2_ITERATIONS = 100000;
const SALT_LEN = 32;
const IV_LEN = 16;
const KEY_LEN = 32;

function getPassphrase(): string {
  return process.env.WALLET_ENCRYPTION_KEY ?? process.env.SESSION_SECRET ?? "ckb-agent-wallet-dev-key";
}

export function encryptPrivateKey(privateKeyHex: string, passphrase?: string): string {
  const phrase = passphrase ?? getPassphrase();
  const salt = randomBytes(SALT_LEN);
  const iv = randomBytes(IV_LEN);
  const key = pbkdf2Sync(phrase, salt, PBKDF2_ITERATIONS, KEY_LEN, "sha256");
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(privateKeyHex, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  // Format: salt:iv:authTag:encrypted (all hex)
  return [salt.toString("hex"), iv.toString("hex"), authTag.toString("hex"), encrypted.toString("hex")].join(":");
}

export function decryptPrivateKey(encryptedData: string, passphrase?: string): string {
  const phrase = passphrase ?? getPassphrase();
  const [saltHex, ivHex, authTagHex, encryptedHex] = encryptedData.split(":");
  const salt = Buffer.from(saltHex, "hex");
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");
  const key = pbkdf2Sync(phrase, salt, PBKDF2_ITERATIONS, KEY_LEN, "sha256");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final("utf8");
}

export interface GeneratedWallet {
  privateKeyHex: string;
  publicKeyHex: string;
  address: string;
  encryptedPrivateKey: string;
}

export function generateWallet(network: "mainnet" | "testnet", passphrase?: string): GeneratedWallet {
  const privateKey = secp256k1.utils.randomSecretKey();
  const privateKeyHex = bytesToHex(privateKey).slice(2); // no 0x prefix for signing
  const publicKey = secp256k1.getPublicKey(privateKey, true); // compressed
  const publicKeyHex = bytesToHex(publicKey);
  const address = deriveCkbAddress(publicKey, network);
  const encryptedPrivateKey = encryptPrivateKey(privateKeyHex, passphrase);
  return { privateKeyHex, publicKeyHex, address, encryptedPrivateKey };
}

export interface SignedWitness {
  lock: string;
}

// Sign a CKB transaction hash
// The message for CKB secp256k1 is the tx_hash with the witness placeholder
export function signTxHash(txHash: string, encryptedPrivateKey: string, passphrase?: string): string {
  const privateKeyHex = decryptPrivateKey(encryptedPrivateKey, passphrase);
  const privateKeyBytes = hexToBytes(privateKeyHex);
  const msgBytes = hexToBytes(txHash);
  const sig = secp256k1.sign(msgBytes, privateKeyBytes);
  // In @noble/curves v2, sign() returns Uint8Array directly (compact format)
  return bytesToHex(sig instanceof Uint8Array ? sig : (sig as { toCompactRawBytes(): Uint8Array }).toCompactRawBytes());
}

// Build secp256k1 lock script for a given address (snake_case matches CkbScript)
export function buildLockScript(args: string): { code_hash: string; hash_type: string; args: string } {
  return {
    code_hash: "0x" + SECP256K1_CODE_HASH,
    hash_type: "type",
    args,
  };
}

// Extract lock args (20-byte pubkey hash) from a CKB address
export function addressToLockArgs(address: string): string {
  const decoded = bech32m.decode(address, 1023);
  const payload = bech32m.fromWords(decoded.words);
  // Skip 0x00 (full format flag), 32 bytes code_hash, 1 byte hash_type = 34 bytes offset
  const lockArgs = payload.slice(34);
  return bytesToHex(lockArgs);
}

// Compute CKB capacity needed for a basic cell (61 CKB minimum)
export const MIN_CELL_CAPACITY = BigInt(6100000000); // 61 CKB in shannons

export { bytesToHex, hexToBytes };
