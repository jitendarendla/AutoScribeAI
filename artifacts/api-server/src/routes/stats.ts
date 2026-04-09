import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db, chatsTable, messagesTable, savedOutputsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/stats", async (_req, res): Promise<void> => {
  const [[{ totalChats }], [{ totalMessages }], [{ totalSaved }]] =
    await Promise.all([
      db.select({ totalChats: sql<number>`COUNT(*)::int` }).from(chatsTable),
      db.select({ totalMessages: sql<number>`COUNT(*)::int` }).from(messagesTable),
      db.select({ totalSaved: sql<number>`COUNT(*)::int` }).from(savedOutputsTable),
    ]);

  const modeBreakdown = await db
    .select({
      mode: chatsTable.mode,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(chatsTable)
    .groupBy(chatsTable.mode);

  res.json({
    totalChats,
    totalMessages,
    totalSaved,
    modeBreakdown,
  });
});

export default router;
