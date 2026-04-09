import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, savedOutputsTable } from "@workspace/db";
import { extractUser } from "../lib/auth-middleware";

const router: IRouter = Router();

router.get("/saved", async (req, res): Promise<void> => {
  const auth = extractUser(req);
  const guestSessionId = (req.query["guestSessionId"] as string) ?? null;
  const userId = auth?.userId ?? null;

  let saved;
  if (userId) {
    saved = await db
      .select()
      .from(savedOutputsTable)
      .where(eq(savedOutputsTable.userId, userId))
      .orderBy(savedOutputsTable.createdAt);
  } else if (guestSessionId) {
    saved = await db
      .select()
      .from(savedOutputsTable)
      .where(eq(savedOutputsTable.userId, -1))
      .orderBy(savedOutputsTable.createdAt);
    saved = [];
  } else {
    saved = [];
  }

  res.json(
    saved.map((s) => ({
      ...s,
      createdAt: s.createdAt.toISOString(),
    }))
  );
});

router.post("/saved", async (req, res): Promise<void> => {
  const auth = extractUser(req);
  const { title, content, mode, chatId, guestSessionId } = req.body as {
    title?: string;
    content?: string;
    mode?: string;
    chatId?: number | null;
    guestSessionId?: string | null;
  };

  if (!title || !content || !mode) {
    res.status(400).json({ error: "title, content, and mode are required" });
    return;
  }

  const [saved] = await db
    .insert(savedOutputsTable)
    .values({
      title,
      content,
      mode,
      chatId: chatId ?? null,
      userId: auth?.userId ?? null,
    })
    .returning();

  res.status(201).json({
    ...saved,
    createdAt: saved.createdAt.toISOString(),
  });
});

router.delete("/saved/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  await db.delete(savedOutputsTable).where(eq(savedOutputsTable.id, id));
  res.sendStatus(204);
});

export default router;
