/**
 * Minimal CKB molecule serializer for transaction hash computation and signing.
 * Implements only the types needed for RawTransaction and WitnessArgs.
 *
 * Molecule spec: https://github.com/nervosnetwork/molecule
 */
import { blake2b } from "@noble/hashes/blake2.js";
import type { CkbTransaction } from "./ckb-rpc.js";

// ─── Primitives ──────────────────────────────────────────────────────────────

function concat(...arrays: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const a of arrays) total += a.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

function uint32le(n: number): Uint8Array {
  const buf = new Uint8Array(4);
  buf[0] = n & 0xff;
  buf[1] = (n >> 8) & 0xff;
  buf[2] = (n >> 16) & 0xff;
  buf[3] = (n >> 24) & 0xff;
  return buf;
}

function uint64le(n: bigint): Uint8Array {
  const buf = new Uint8Array(8);
  let v = n;
  for (let i = 0; i < 8; i++) {
    buf[i] = Number(v & BigInt(0xff));
    v >>= BigInt(8);
  }
  return buf;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const arr = new Uint8Array(clean.length / 2);
  for (let i = 0; i < arr.length; i++) {
    arr[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return arr;
}

// ─── Molecule layout helpers ──────────────────────────────────────────────────

/**
 * fixvec: u32-LE item_count + items (each fixed-size)
 */
function fixvec(items: Uint8Array[]): Uint8Array {
  return concat(uint32le(items.length), ...items);
}

/**
 * dynvec / table layout:
 *   u32-LE total_size | offsets[0..N-1] (u32-LE each) | fields[0..N-1]
 *   offset[i] = absolute byte offset from start of this structure to field[i]
 *   first field starts at byte 4 + 4*N
 */
function tableOrDynvec(fields: Uint8Array[]): Uint8Array {
  const N = fields.length;
  const firstFieldOffset = 4 + 4 * N;
  let totalSize = firstFieldOffset;
  for (const f of fields) totalSize += f.length;

  const header = new Uint8Array(4 + 4 * N);
  const dv = new DataView(header.buffer);
  dv.setUint32(0, totalSize, true);

  let currentOffset = firstFieldOffset;
  for (let i = 0; i < N; i++) {
    dv.setUint32(4 + i * 4, currentOffset, true);
    currentOffset += fields[i].length;
  }

  return concat(header, ...fields);
}

/**
 * Molecule Bytes = fixvec<byte> = u32-LE length + raw bytes
 */
function moleculeBytes(data: Uint8Array): Uint8Array {
  return concat(uint32le(data.length), data);
}

// ─── CKB-specific types ───────────────────────────────────────────────────────

/**
 * Script (Table):
 *   code_hash: Byte32
 *   hash_type: byte
 *   args:      Bytes
 */
function serializeScript(s: { code_hash: string; hash_type: string; args: string }): Uint8Array {
  const codeHash = hexToBytes(s.code_hash); // 32 bytes
  const hashTypeByte = new Uint8Array([s.hash_type === "data" ? 0 : s.hash_type === "type" ? 1 : 2]);
  const args = moleculeBytes(hexToBytes(s.args));
  return tableOrDynvec([codeHash, hashTypeByte, args]);
}

/**
 * ScriptOpt: None = 0 bytes, Some(script) = script bytes
 */
function serializeScriptOpt(
  s: { code_hash: string; hash_type: string; args: string } | null | undefined,
): Uint8Array {
  if (!s) return new Uint8Array(0);
  return serializeScript(s);
}

/**
 * CellOutput (Table):
 *   capacity: Uint64
 *   lock:     Script
 *   type_:    ScriptOpt
 */
function serializeCellOutput(o: {
  capacity: string;
  lock: { code_hash: string; hash_type: string; args: string };
  type?: { code_hash: string; hash_type: string; args: string } | null;
}): Uint8Array {
  return tableOrDynvec([
    uint64le(BigInt(o.capacity)),
    serializeScript(o.lock),
    serializeScriptOpt(o.type),
  ]);
}

/**
 * OutPoint (Struct, fixed 36 bytes):
 *   tx_hash: Byte32
 *   index:   Uint32
 */
function serializeOutPoint(op: { tx_hash: string; index: string }): Uint8Array {
  return concat(hexToBytes(op.tx_hash), uint32le(parseInt(op.index, 16)));
}

/**
 * CellDep (Struct, fixed 37 bytes):
 *   out_point: OutPoint
 *   dep_type:  byte  (0=code, 1=dep_group)
 */
function serializeCellDep(dep: {
  out_point: { tx_hash: string; index: string };
  dep_type: string;
}): Uint8Array {
  return concat(serializeOutPoint(dep.out_point), new Uint8Array([dep.dep_type === "dep_group" ? 1 : 0]));
}

/**
 * CellInput (Struct, fixed 44 bytes):
 *   since:           Uint64
 *   previous_output: OutPoint
 */
function serializeCellInput(input: {
  since: string;
  previous_output: { tx_hash: string; index: string };
}): Uint8Array {
  return concat(uint64le(BigInt(input.since ?? "0x0")), serializeOutPoint(input.previous_output));
}

/**
 * RawTransaction (Table):
 *   version:      Uint32
 *   cell_deps:    CellDepVec  (fixvec of 37-byte structs)
 *   header_deps:  Byte32Vec   (fixvec of 32-byte hashes)
 *   inputs:       CellInputVec (fixvec of 44-byte structs)
 *   outputs:      CellOutputVec (dynvec of CellOutput tables)
 *   outputs_data: BytesVec      (dynvec of Bytes)
 */
export function serializeRawTransaction(tx: CkbTransaction): Uint8Array {
  const version = uint32le(parseInt((tx.version as string) ?? "0x0", 16));
  const cellDeps = fixvec((tx.cell_deps as Array<{ out_point: { tx_hash: string; index: string }; dep_type: string }>).map(serializeCellDep));
  const headerDeps = fixvec((tx.header_deps as string[]).map(hexToBytes));
  const inputs = fixvec(
    tx.inputs.map((inp) =>
      serializeCellInput({ since: inp.since, previous_output: inp.previous_output }),
    ),
  );
  const outputs = tableOrDynvec(tx.outputs.map(serializeCellOutput));
  const outputsData = tableOrDynvec(
    tx.outputs_data.map((d) => moleculeBytes(hexToBytes(d))),
  );

  return tableOrDynvec([version, cellDeps, headerDeps, inputs, outputs, outputsData]);
}

// ─── Blake2b-256 with CKB personalization ─────────────────────────────────────

function blake2b256ckb(data: Uint8Array): Uint8Array {
  return blake2b(data, { dkLen: 32, personalization: new TextEncoder().encode("ckb-default-hash") });
}

function bytesToHex(bytes: Uint8Array): string {
  return "0x" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ─── TX hash ─────────────────────────────────────────────────────────────────

/**
 * Compute the CKB transaction hash = blake2b_256(molecule_serialize(raw_transaction))
 */
export function computeTxHash(tx: CkbTransaction): string {
  const raw = serializeRawTransaction(tx);
  return bytesToHex(blake2b256ckb(raw));
}

// ─── WitnessArgs ─────────────────────────────────────────────────────────────

/**
 * WitnessArgs (Table):
 *   lock:        BytesOpt   (Some(Bytes) or empty)
 *   input_type:  BytesOpt
 *   output_type: BytesOpt
 */
export function serializeWitnessArgs(lockBytes?: Uint8Array): Uint8Array {
  const lockField = lockBytes ? moleculeBytes(lockBytes) : new Uint8Array(0);
  return tableOrDynvec([lockField, new Uint8Array(0), new Uint8Array(0)]);
}

// ─── Signing message ─────────────────────────────────────────────────────────

/**
 * Compute the CKB secp256k1 signing message:
 *   blake2b_256( tx_hash || u64_le(len(witness)) || witness )
 *
 * The witness passed here should be the WitnessArgs with lock = 65 zero bytes (placeholder).
 */
export function computeSigningMessage(txHashHex: string, witnessBytes: Uint8Array): Uint8Array {
  const txHashBytes = hexToBytes(txHashHex);
  const witnessLenU64 = uint64le(BigInt(witnessBytes.length));
  return blake2b256ckb(concat(txHashBytes, witnessLenU64, witnessBytes));
}
