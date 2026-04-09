import { Router, type IRouter } from "express";
import { sql, eq } from "drizzle-orm";
import { db, chatsTable, messagesTable, savedOutputsTable } from "@workspace/db";
import { extractUser } from "../lib/auth-middleware";

const router: IRouter = Router();

router.get("/stats", async (req, res): Promise<void> => {
  const auth = extractUser(req);
  const userId = auth?.userId ?? null;

  const chatWhere = userId ? eq(chatsTable.userId, userId) : sql`1=1`;

  const [[{ totalChats }], [{ totalMessages }], [{ totalSaved }]] = await Promise.all([
    db.select({ totalChats: sql<number>`COUNT(*)::int` }).from(chatsTable).where(chatWhere),
    db.select({ totalMessages: sql<number>`COUNT(*)::int` }).from(messagesTable),
    db.select({ totalSaved: sql<number>`COUNT(*)::int` }).from(savedOutputsTable),
  ]);

  const modeBreakdown = await db
    .select({
      mode: chatsTable.mode,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(chatsTable)
    .where(chatWhere)
    .groupBy(chatsTable.mode);

  res.json({
    totalChats,
    totalMessages,
    totalSaved,
    modeBreakdown,
  });
});

export default router;
