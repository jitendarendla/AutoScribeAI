import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, chatsTable, messagesTable } from "@workspace/db";
import {
  CreateChatBody,
  UpdateChatBody,
  UpdateChatParams,
  GetChatParams,
  DeleteChatParams,
  ListMessagesParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/chats", async (req, res): Promise<void> => {
  const chats = await db
    .select({
      id: chatsTable.id,
      title: chatsTable.title,
      mode: chatsTable.mode,
      messageCount: sql<number>`(SELECT COUNT(*) FROM messages WHERE messages.chat_id = ${chatsTable.id})::int`,
      createdAt: chatsTable.createdAt,
      updatedAt: chatsTable.updatedAt,
    })
    .from(chatsTable)
    .orderBy(sql`${chatsTable.updatedAt} DESC`);
  res.json(chats);
});

router.post("/chats", async (req, res): Promise<void> => {
  const parsed = CreateChatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [chat] = await db.insert(chatsTable).values(parsed.data).returning();
  res.status(201).json({
    ...chat,
    messageCount: 0,
    createdAt: chat.createdAt.toISOString(),
    updatedAt: chat.updatedAt.toISOString(),
  });
});

router.get("/chats/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetChatParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid chat ID" });
    return;
  }

  const [chat] = await db
    .select()
    .from(chatsTable)
    .where(eq(chatsTable.id, params.data.id));

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
  const params = UpdateChatParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid chat ID" });
    return;
  }

  const parsed = UpdateChatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [chat] = await db
    .update(chatsTable)
    .set({ title: parsed.data.title })
    .where(eq(chatsTable.id, params.data.id))
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
  const params = DeleteChatParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid chat ID" });
    return;
  }

  await db.delete(chatsTable).where(eq(chatsTable.id, params.data.id));
  res.sendStatus(204);
});

router.get("/chats/:chatId/messages", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.chatId) ? req.params.chatId[0] : req.params.chatId;
  const params = ListMessagesParams.safeParse({ chatId: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid chat ID" });
    return;
  }

  const messages = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.chatId, params.data.chatId))
    .orderBy(messagesTable.createdAt);

  res.json(
    messages.map((m) => ({
      ...m,
      createdAt: m.createdAt.toISOString(),
    }))
  );
});

export default router;
