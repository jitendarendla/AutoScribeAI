import { Router, type IRouter } from "express";
import { db, chatsTable, messagesTable } from "@workspace/db";
import { GenerateBody } from "@workspace/api-zod";
import { openai } from "@workspace/integrations-openai-ai-server";
import { eq, sql } from "drizzle-orm";

const router: IRouter = Router();

function getModeSystemPrompt(mode: string): string {
  switch (mode) {
    case "report":
      return `You are AutoScribe AI+, a professional report generator. Structure your response with clear sections, headings, summaries, and professional language. Format output with markdown headers (##, ###), bullet points, and well-organized paragraphs. Always produce comprehensive, well-structured reports.`;
    case "code":
      return `You are AutoScribe AI+, a senior software engineer and code generator. Generate clean, well-commented, production-ready code. Include explanations, usage examples, and best practices. Use appropriate code blocks with language specifiers.`;
    case "documentation":
      return `You are AutoScribe AI+, a technical documentation expert. Create clear, comprehensive documentation with proper structure: overview, parameters/options, examples, and notes. Write for developers who need to understand and use the described system.`;
    case "insight":
      return `You are AutoScribe AI+, an analytical insight generator. Analyze the provided information and generate key insights, patterns, trends, and actionable recommendations. Structure your response with: Key Findings, Analysis, Patterns, and Recommendations.`;
    default:
      return `You are AutoScribe AI+, a smart AI assistant. Provide helpful, structured, and detailed responses.`;
  }
}

function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
    "being", "have", "has", "had", "do", "does", "did", "will", "would",
    "could", "should", "may", "might", "shall", "can", "this", "that",
    "these", "those", "it", "its", "as", "if", "then", "than", "so",
    "we", "you", "i", "he", "she", "they", "our", "your", "their", "my",
  ]);

  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stopWords.has(w));

  const freq = new Map<string, number>();
  for (const w of words) {
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }

  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);
}

function getSuggestions(mode: string, content: string): string[] {
  const suggestions: Record<string, string[]> = {
    report: [
      "Summarize this report",
      "Generate an executive summary",
      "Extract key action items",
      "Create a detailed breakdown",
    ],
    code: [
      "Explain this code",
      "Generate unit tests for this",
      "Optimize this code",
      "Document this code",
    ],
    documentation: [
      "Generate code examples",
      "Create a quick-start guide",
      "Summarize the key points",
      "List all parameters",
    ],
    insight: [
      "Generate a detailed report",
      "Create visualizable data",
      "Summarize key findings",
      "Suggest next steps",
    ],
  };
  return suggestions[mode] ?? suggestions["report"];
}

router.post("/generate", async (req, res): Promise<void> => {
  const parsed = GenerateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { prompt, mode, chatId, fileContent } = parsed.data;

  const userMessage = fileContent
    ? `${prompt}\n\n---\nFile Content:\n${fileContent}`
    : prompt;

  let chatHistory: { role: "user" | "assistant"; content: string }[] = [];

  if (chatId) {
    const prevMessages = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.chatId, chatId))
      .orderBy(messagesTable.createdAt);

    chatHistory = prevMessages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));
  }

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: getModeSystemPrompt(mode) },
    ...chatHistory,
    { role: "user", content: userMessage },
  ];

  const completion = await openai.chat.completions.create({
    model: "gpt-5.2",
    max_completion_tokens: 8192,
    messages,
  });

  const content = completion.choices[0]?.message?.content ?? "";
  const keywords = extractKeywords(content);
  const suggestions = getSuggestions(mode, content);

  let resolvedChatId = chatId ?? null;
  let userMsgId: number | null = null;
  let aiMsgId: number | null = null;

  if (resolvedChatId) {
    const [userMsg] = await db
      .insert(messagesTable)
      .values({
        chatId: resolvedChatId,
        role: "user",
        content: userMessage,
        mode,
        keywords: null,
      })
      .returning();
    userMsgId = userMsg.id;

    const [aiMsg] = await db
      .insert(messagesTable)
      .values({
        chatId: resolvedChatId,
        role: "ai",
        content,
        mode,
        keywords: keywords.join(","),
      })
      .returning();
    aiMsgId = aiMsg.id;

    await db
      .update(chatsTable)
      .set({ updatedAt: new Date(), mode })
      .where(eq(chatsTable.id, resolvedChatId));
  } else {
    const titleWords = prompt.split(" ").slice(0, 6).join(" ");
    const chatTitle = titleWords.length > 3 ? titleWords : `New ${mode} chat`;
    const [newChat] = await db
      .insert(chatsTable)
      .values({ title: chatTitle, mode })
      .returning();
    resolvedChatId = newChat.id;

    const [userMsg] = await db
      .insert(messagesTable)
      .values({
        chatId: resolvedChatId,
        role: "user",
        content: userMessage,
        mode,
        keywords: null,
      })
      .returning();
    userMsgId = userMsg.id;

    const [aiMsg] = await db
      .insert(messagesTable)
      .values({
        chatId: resolvedChatId,
        role: "ai",
        content,
        mode,
        keywords: keywords.join(","),
      })
      .returning();
    aiMsgId = aiMsg.id;
  }

  res.json({
    content,
    mode,
    keywords,
    suggestions,
    messageId: aiMsgId,
    chatId: resolvedChatId,
  });
});

export default router;
