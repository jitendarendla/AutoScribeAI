import { Router, type IRouter } from "express";
import { eq, sql, and, or, isNull } from "drizzle-orm";
import { db, chatsTable, messagesTable } from "@workspace/db";
import { extractUser } from "../lib/auth-middleware";

const router: IRouter = Router();

function getWhere(userId: number | null, guestSessionId: string | null) {
  if (userId) return eq(chatsTable.userId, userId);
  if (guestSessionId) return eq(chatsTable.guestSessionId, guestSessionId);
  return isNull(chatsTable.userId);
}

router.get("/chats", async (req, res): Promise<void> => {
  const auth = extractUser(req);
  const guestSessionId = (req.query["guestSessionId"] as string) ?? null;
  const userId = auth?.userId ?? null;

  const chats = await db
    .select({
      id: chatsTable.id,
      userId: chatsTable.userId,
      guestSessionId: chatsTable.guestSessionId,
      title: chatsTable.title,
      mode: chatsTable.mode,
      template: chatsTable.template,
      isSaved: chatsTable.isSaved,
      shareToken: chatsTable.shareToken,
      messageCount: sql<number>`(SELECT COUNT(*) FROM messages WHERE messages.chat_id = ${chatsTable.id})::int`,
      createdAt: chatsTable.createdAt,
      updatedAt: chatsTable.updatedAt,
    })
    .from(chatsTable)
    .where(getWhere(userId, guestSessionId))
    .orderBy(sql`${chatsTable.updatedAt} DESC`);

  res.json(
    chats.map((c) => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }))
  );
});

router.post("/chats", async (req, res): Promise<void> => {
  const auth = extractUser(req);
  const { title, mode, guestSessionId } = req.body as {
    title: string;
    mode: string;
    guestSessionId?: string;
  };

  if (!title || !mode) {
    res.status(400).json({ error: "title and mode are required" });
    return;
  }

  const [chat] = await db
    .insert(chatsTable)
    .values({
      title,
      mode,
      userId: auth?.userId ?? null,
      guestSessionId: auth ? null : (guestSessionId ?? null),
    })
    .returning();

  res.status(201).json({
    ...chat,
    messageCount: 0,
    createdAt: chat.createdAt.toISOString(),
    updatedAt: chat.updatedAt.toISOString(),
  });
});

router.get("/chats/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid chat ID" });
    return;
  }

  const [chat] = await db.select().from(chatsTable).where(eq(chatsTable.id, id));
  if (!chat) {
    res.status(404).json({ error: "Chat not found" });
    return;
  }

  const messages = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.chatId, chat.id))
    .orderBy(messagesTable.createdAt);

  res.json({
    ...chat,
    createdAt: chat.createdAt.toISOString(),
    updatedAt: chat.updatedAt.toISOString(),
    messages: messages.map((m) => ({
      ...m,
      createdAt: m.createdAt.toISOString(),
    })),
  });
});

router.patch("/chats/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid chat ID" });
    return;
  }

  const { title } = req.body as { title?: string };
  if (!title) {
    res.status(400).json({ error: "title is required" });
    return;
  }

  const [chat] = await db
    .update(chatsTable)
    .set({ title })
    .where(eq(chatsTable.id, id))
    .returning();

  if (!chat) {
    res.status(404).json({ error: "Chat not found" });
    return;
  }

  const [{ count }] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(messagesTable)
    .where(eq(messagesTable.chatId, chat.id));

  res.json({
    ...chat,
    messageCount: count,
    createdAt: chat.createdAt.toISOString(),
    updatedAt: chat.updatedAt.toISOString(),
  });
});

router.delete("/chats/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid chat ID" });
    return;
  }

  await db.delete(chatsTable).where(eq(chatsTable.id, id));
  res.sendStatus(204);
});

router.patch("/chats/:id/save", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid chat ID" });
    return;
  }

  const [existing] = await db.select().from(chatsTable).where(eq(chatsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Chat not found" });
    return;
  }

  const [chat] = await db
    .update(chatsTable)
    .set({ isSaved: !existing.isSaved })
    .where(eq(chatsTable.id, id))
    .returning();

  const [{ count }] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(messagesTable)
    .where(eq(messagesTable.chatId, chat.id));

  res.json({
    ...chat,
    messageCount: count,
    createdAt: chat.createdAt.toISOString(),
    updatedAt: chat.updatedAt.toISOString(),
  });
});

router.get("/chats/:chatId/messages", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.chatId) ? req.params.chatId[0] : req.params.chatId;
  const chatId = parseInt(raw, 10);
  if (isNaN(chatId)) {
    res.status(400).json({ error: "Invalid chat ID" });
    return;
  }

  const messages = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.chatId, chatId))
    .orderBy(messagesTable.createdAt);

  res.json(
    messages.map((m) => ({
      ...m,
      createdAt: m.createdAt.toISOString(),
    }))
  );
});

export default router;
