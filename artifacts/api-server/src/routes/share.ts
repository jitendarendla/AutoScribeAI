import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { db, shareLinksTable } from "@workspace/db";
import { extractUser } from "../lib/auth-middleware";

const router: IRouter = Router();

router.get("/share/list", async (req, res): Promise<void> => {
  const auth = extractUser(req);
  const guestSessionId = (req.query["guestSessionId"] as string) ?? null;

  let links;
  if (auth?.userId) {
    links = await db
      .select({
        id: shareLinksTable.id,
        token: shareLinksTable.token,
        title: shareLinksTable.title,
        mode: shareLinksTable.mode,
        createdAt: shareLinksTable.createdAt,
      })
      .from(shareLinksTable)
      .orderBy(shareLinksTable.createdAt);
  } else {
    links = [];
  }

  res.json(
    links.map((l) => ({
      ...l,
      createdAt: l.createdAt.toISOString(),
    }))
  );
});

router.post("/share", async (req, res): Promise<void> => {
  const { content, title, mode, chatId } = req.body as {
    content?: string;
    title?: string;
    mode?: string;
    chatId?: number | null;
  };

  if (!content || !title || !mode) {
    res.status(400).json({ error: "content, title, and mode are required" });
    return;
  }

  const token = uuidv4().replace(/-/g, "").slice(0, 16);

  await db.insert(shareLinksTable).values({
    token,
    title,
    content,
    mode,
    chatId: chatId ?? null,
  });

  const host = req.get("host") ?? "localhost";
  const protocol = req.headers["x-forwarded-proto"] ?? req.protocol ?? "https";
  const url = `${protocol}://${host}/app/share/${token}`;

  res.status(201).json({ token, url });
});

router.get("/share/:token", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.token) ? req.params.token[0] : req.params.token;
  if (!raw) {
    res.status(400).json({ error: "Invalid token" });
    return;
  }

  const [link] = await db
    .select()
    .from(shareLinksTable)
    .where(eq(shareLinksTable.token, raw));

  if (!link) {
    res.status(404).json({ error: "Shared output not found" });
    return;
  }

  res.json({
    title: link.title,
    content: link.content,
    mode: link.mode,
    createdAt: link.createdAt.toISOString(),
  });
});

export default router;
