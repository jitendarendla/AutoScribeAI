import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { db, shareLinksTable } from "@workspace/db";
import { CreateShareLinkBody, GetSharedOutputParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/share", async (req, res): Promise<void> => {
  const parsed = CreateShareLinkBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const token = uuidv4().replace(/-/g, "").slice(0, 16);

  await db.insert(shareLinksTable).values({
    token,
    title: parsed.data.title,
    content: parsed.data.content,
    mode: parsed.data.mode,
  });

  const host = req.get("host") ?? "localhost";
  const protocol = req.protocol ?? "https";
  const url = `${protocol}://${host}/share/${token}`;

  res.status(201).json({ token, url });
});

router.get("/share/:token", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.token) ? req.params.token[0] : req.params.token;
  const params = GetSharedOutputParams.safeParse({ token: raw });
  if (!params.success) {
    res.status(400).json({ error: "Invalid token" });
    return;
  }

  const [link] = await db
    .select()
    .from(shareLinksTable)
    .where(eq(shareLinksTable.token, params.data.token));

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
