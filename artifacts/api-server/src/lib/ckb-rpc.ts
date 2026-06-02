import { logger } from "./logger";

const CKB_TESTNET_RPC = "https://testnet.ckb.dev/rpc";
const CKB_MAINNET_RPC = "https://mainnet.ckb.dev/rpc";

export function getRpcUrl(network: string): string {
  if (process.env.CKB_RPC_URL) return process.env.CKB_RPC_URL;
  return network === "mainnet" ? CKB_MAINNET_RPC : CKB_TESTNET_RPC;
}

async function rpcCall(network: string, method: string, params: unknown[]): Promise<unknown> {
  const url = getRpcUrl(network);
  const body = JSON.stringify({ id: 1, jsonrpc: "2.0", method, params });
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    logger.warn({ method, err }, "CKB RPC request failed (network error)");
    throw new Error(`CKB RPC unreachable: ${String(err)}`);
  }
  if (!resp.ok) throw new Error(`CKB RPC HTTP ${resp.status}`);
  const json = (await resp.json()) as { result?: unknown; error?: { message: string } };
  if (json.error) throw new Error(`CKB RPC error: ${json.error.message}`);
  return json.result;
}

export interface CkbCellOutPoint {
  tx_hash: string;
  index: string;
}

export interface CkbScript {
  code_hash: string;
  hash_type: string;
  args: string;
}

export interface CkbCell {
  output: {
    capacity: string;
    lock: CkbScript;
    type?: CkbScript | null;
  };
  output_data: string;
  out_point: CkbCellOutPoint;
  block_number: string;
  tx_index: string;
}

export interface CkbLiveCellsResult {
  objects: CkbCell[];
  last_cursor: string;
}

// Use CKB Indexer RPC to fetch live cells for a lock script
export async function getLiveCells(
  network: string,
  lockScript: CkbScript,
  limit = 50,
): Promise<CkbCell[]> {
  try {
    const result = (await rpcCall(network, "get_cells", [
      { script: lockScript, script_type: "lock" },
      "asc",
      `0x${limit.toString(16)}`,
    ])) as CkbLiveCellsResult;
    return result.objects ?? [];
  } catch (err) {
    logger.warn({ err }, "Failed to fetch live cells from CKB node");
    return [];
  }
}

export interface CapacityResult {
  capacity: string;
  block_hash: string;
  block_number: string;
}

export async function getCellsCapacity(network: string, lockScript: CkbScript): Promise<string> {
  try {
    const result = (await rpcCall(network, "get_cells_capacity", [
      { script: lockScript, script_type: "lock" },
    ])) as CapacityResult;
    return result.capacity ?? "0x0";
  } catch (err) {
    logger.warn({ err }, "Failed to fetch capacity from CKB node");
    return "0x0";
  }
}

export interface CkbTransaction {
  version: string;
  cell_deps: unknown[];
  header_deps: unknown[];
  inputs: Array<{
    previous_output: CkbCellOutPoint;
    since: string;
  }>;
  outputs: Array<{
    capacity: string;
    lock: CkbScript;
    type?: CkbScript | null;
  }>;
  outputs_data: string[];
  witnesses: string[];
}

export async function sendTransaction(network: string, tx: CkbTransaction): Promise<string> {
  const txHash = (await rpcCall(network, "send_transaction", [tx, "passthrough"])) as string;
  return txHash;
}

export async function getTransaction(
  network: string,
  txHash: string,
): Promise<{ transaction_status: { status: string } } | null> {
  try {
    const result = await rpcCall(network, "get_transaction", [txHash]);
    return result as { transaction_status: { status: string } };
  } catch {
    return null;
  }
}

// Build a simple CKB transfer transaction
// Returns a raw (unsigned) transaction ready for signing
export function buildTransferTx(
  inputCells: CkbCell[],
  toAddress: string,
  toLockScript: CkbScript,
  fromLockScript: CkbScript,
  amountShannons: bigint,
  memo: string = "",
): CkbTransaction {
  const SECP256K1_DEP: { out_point: CkbCellOutPoint; dep_type: string } = {
    out_point: {
      tx_hash: "0x71a7ba8fc96349fea0ed3a5c47992e3b4084b031a42264a018e0072e8172e46c",
      index: "0x0",
    },
    dep_type: "dep_group",
  };

  const inputs = inputCells.map((cell) => ({
    previous_output: cell.out_point,
    since: "0x0",
  }));

  const totalInput = inputCells.reduce(
    (sum, c) => sum + BigInt(c.output.capacity),
    BigInt(0),
  );

  const memoData = memo ? "0x" + Buffer.from(memo, "utf8").toString("hex") : "0x";
  const MIN_CHANGE_CAPACITY = BigInt(6100000000); // 61 CKB
  const FEE = BigInt(1000); // 1000 shannons fee estimate
  const changeCapacity = totalInput - amountShannons - FEE;

  const outputs: CkbTransaction["outputs"] = [
    { capacity: `0x${amountShannons.toString(16)}`, lock: toLockScript },
  ];
  const outputsData: string[] = [memoData];

  if (changeCapacity >= MIN_CHANGE_CAPACITY) {
    outputs.push({ capacity: `0x${changeCapacity.toString(16)}`, lock: fromLockScript });
    outputsData.push("0x");
  }

  return {
    version: "0x0",
    cell_deps: [SECP256K1_DEP],
    header_deps: [],
    inputs,
    outputs,
    outputs_data: outputsData,
    witnesses: inputs.map((_, i) => (i === 0 ? "0x" : "0x")),
  };
}
