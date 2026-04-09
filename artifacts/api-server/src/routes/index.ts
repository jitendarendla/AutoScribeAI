import { Router, type IRouter } from "express";
import healthRouter from "./health";
import chatsRouter from "./chats";
import generateRouter from "./generate";
import uploadRouter from "./upload";
import savedRouter from "./saved";
import shareRouter from "./share";
import statsRouter from "./stats";

const router: IRouter = Router();

router.use(healthRouter);
router.use(chatsRouter);
router.use(generateRouter);
router.use(uploadRouter);
router.use(savedRouter);
router.use(shareRouter);
router.use(statsRouter);

export default router;
