import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, savedOutputsTable } from "@workspace/db";
import { CreateSavedOutputBody, DeleteSavedOutputParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/saved", async (_req, res): Promise<void> => {
  const saved = await db
    .select()
    .from(savedOutputsTable)
    .orderBy(savedOutputsTable.createdAt);

  res.json(
    saved.map((s) => ({
      ...s,
      createdAt: s.createdAt.toISOString(),
    }))
  );
});

router.post("/saved", async (req, res): Promise<void> => {
  const parsed = CreateSavedOutputBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [saved] = await db
    .insert(savedOutputsTable)
    .values(parsed.data)
    .returning();

  res.status(201).json({
    ...saved,
    createdAt: saved.createdAt.toISOString(),
  });
});

router.delete("/saved/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = DeleteSavedOutputParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  await db
    .delete(savedOutputsTable)
    .where(eq(savedOutputsTable.id, params.data.id));

  res.sendStatus(204);
});

export default router;
