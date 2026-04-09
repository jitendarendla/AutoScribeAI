import { Router, type IRouter } from "express";
import multer from "multer";
import { db, filesTable } from "@workspace/db";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function parseCSV(content: string): string {
  const lines = content.split("\n").filter(Boolean);
  if (lines.length === 0) return content;

  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const rows = lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    return headers.map((h, i) => `${h}: ${values[i] ?? ""}`).join(", ");
  });

  return `CSV Data with columns: ${headers.join(", ")}\n\nRows:\n${rows.join("\n")}`;
}

router.post("/upload", upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  const { originalname, buffer, mimetype } = req.file;
  const ext = originalname.toLowerCase().split(".").pop();

  if (ext !== "txt" && ext !== "csv") {
    res.status(400).json({ error: "Only TXT and CSV files are supported" });
    return;
  }

  let content = buffer.toString("utf-8");
  if (ext === "csv") {
    content = parseCSV(content);
  }

  content = content.slice(0, 50000);

  const chatId = req.body.chatId ? parseInt(req.body.chatId, 10) : null;

  const [file] = await db
    .insert(filesTable)
    .values({
      filename: originalname,
      content,
      chatId: isNaN(chatId!) ? null : chatId,
    })
    .returning();

  res.json({
    content,
    filename: originalname,
    fileId: file.id,
  });
});

export default router;
