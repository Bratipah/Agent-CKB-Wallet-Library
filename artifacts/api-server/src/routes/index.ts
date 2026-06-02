import { Router, type IRouter } from "express";
import healthRouter from "./health";
import walletsRouter from "./wallets";
import cellsRouter from "./cells";
import transactionsRouter from "./transactions";
import safetyRouter from "./safety";
import fiberRouter from "./fiber";
import dobsRouter from "./dobs";
import otxRouter from "./otx";
import auditRouter from "./audit";

const router: IRouter = Router();

router.use(healthRouter);
router.use(walletsRouter);
router.use(cellsRouter);
router.use(transactionsRouter);
router.use(safetyRouter);
router.use(fiberRouter);
router.use(dobsRouter);
router.use(otxRouter);
router.use(auditRouter);

export default router;
