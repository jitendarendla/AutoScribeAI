import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import chatsRouter from "./chats";
import generateRouter from "./generate";
import uploadRouter from "./upload";
import savedRouter from "./saved";
import shareRouter from "./share";
import statsRouter from "./stats";
import filesRouter from "./files";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(chatsRouter);
router.use(generateRouter);
router.use(uploadRouter);
router.use(savedRouter);
router.use(shareRouter);
router.use(statsRouter);
router.use(filesRouter);

export default router;
