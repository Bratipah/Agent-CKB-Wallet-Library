import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, agentWalletsTable } from "@workspace/db";
import { ListCellsParams, ListCellsResponse } from "@workspace/api-zod";
import { addressToLockArgs, buildLockScript } from "../lib/ckb-wallet";
import { getLiveCells } from "../lib/ckb-rpc";

const router: IRouter = Router();

// GET /wallets/:id/cells
router.get("/wallets/:id/cells", async (req, res): Promise<void> => {
  const params = ListCellsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [wallet] = await db.select().from(agentWalletsTable).where(eq(agentWalletsTable.id, params.data.id));
  if (!wallet) {
    res.status(404).json({ error: "Wallet not found" });
    return;
  }

  const lockArgs = addressToLockArgs(wallet.address);
  const lockScript = buildLockScript(lockArgs);
  const cells = await getLiveCells(wallet.network, lockScript, 100);

  res.json(
    ListCellsResponse.parse(
      cells.map((c) => ({
        txHash: c.out_point.tx_hash,
        index: c.out_point.index,
        capacity: BigInt(c.output.capacity).toString(),
        lockScript: {
          codeHash: c.output.lock.code_hash,
          hashType: c.output.lock.hash_type,
          args: c.output.lock.args,
        },
        typeScript: c.output.type
          ? {
              codeHash: c.output.type.code_hash,
              hashType: c.output.type.hash_type,
              args: c.output.type.args,
            }
          : undefined,
        data: c.output_data,
      })),
    ),
  );
});

export default router;
