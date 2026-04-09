import { Router, type IRouter } from "express";
import { db, filesTable } from "@workspace/db";
import { eq, isNull } from "drizzle-orm";
import { extractUser } from "../lib/auth-middleware";

const router: IRouter = Router();

router.get("/files", async (req, res): Promise<void> => {
  const auth = extractUser(req);
  const guestSessionId = (req.query["guestSessionId"] as string) ?? null;
  const userId = auth?.userId ?? null;

  let files;
  if (userId) {
    files = await db
      .select({
        id: filesTable.id,
        filename: filesTable.filename,
        fileType: filesTable.fileType,
        createdAt: filesTable.createdAt,
      })
      .from(filesTable)
      .where(eq(filesTable.userId, userId));
  } else if (guestSessionId) {
    files = await db
      .select({
        id: filesTable.id,
        filename: filesTable.filename,
        fileType: filesTable.fileType,
        createdAt: filesTable.createdAt,
      })
      .from(filesTable)
      .where(eq(filesTable.guestSessionId, guestSessionId));
  } else {
    files = [];
  }

  res.json(
    files.map((f) => ({
      ...f,
      createdAt: f.createdAt.toISOString(),
    }))
  );
});

export default router;
