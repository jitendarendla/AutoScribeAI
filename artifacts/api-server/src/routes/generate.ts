import { Router, type IRouter } from "express";
import { db, chatsTable, messagesTable } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import { eq } from "drizzle-orm";
import { extractUser } from "../lib/auth-middleware";

const router: IRouter = Router();

function getTemplateStructure(template: string): string {
  switch (template) {
    case "university":
      return `Introduction, About the Institution, Courses/Programs, Admission Process, Facilities, Benefits/Highlights, Placement/Career Opportunities, Conclusion`;
    case "experiment":
      return `Aim, Introduction/Theory, Prerequisites, Tools/Requirements, Procedure/Steps, Expected Output/Result, Applications, Conclusion`;
    case "project":
      return `Introduction, Problem Statement, Working Principle, Technologies Used, Benefits, Limitations, Real-world Applications, Conclusion`;
    default:
      return `Introduction, Overview, Key Points, Applications/Uses, Benefits/Advantages, Important Details, Conclusion`;
  }
}

function buildSystemPrompt(template: string): string {
  const reportStructure = getTemplateStructure(template);
  return `You are AutoScribe AI+, an expert AI assistant. Given a user prompt, generate a comprehensive response and return ONLY a valid JSON object (no markdown code fences, no extra text) with exactly these four keys:

1. "report": A detailed, well-structured report using markdown headings (## and ###). Structure it with these sections: ${reportStructure}. Use bullet points, numbered lists, and bold text where appropriate.

2. "code": Working, well-commented code relevant to the topic. If the topic is not directly code-related, provide a relevant code example, script, or pseudocode. Include an explanation before the code block. Use proper markdown code fences with language identifiers.

3. "docs": Clear technical documentation with these sections: ## Definition, ## Purpose, ## Working, ## Key Features, ## Example, ## Notes. For code-related topics, document the code structure.

4. "insights": Analysis with these sections: ## Key Findings, ## Analysis, ## Patterns & Trends, ## Recommendations, ## Suggested Next Steps. Include the most valuable observations.

Return only the raw JSON object. Each value must be a string containing markdown.`;
}

function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
    "being", "have", "has", "had", "do", "does", "did", "will", "would",
    "could", "should", "may", "might", "shall", "can", "this", "that",
    "these", "those", "it", "its", "as", "if", "then", "than", "so",
    "we", "you", "i", "he", "she", "they", "our", "your", "their", "my",
    "about", "also", "some", "more", "which", "such", "each", "into",
  ]);
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stopWords.has(w));
  const freq = new Map<string, number>();
  for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);
}

function getSuggestions(mode: string): string[] {
  const suggestions: Record<string, string[]> = {
    Report: ["Generate an executive summary", "Extract key action items", "Create a comparison report", "Convert to documentation"],
    Code: ["Explain this code in detail", "Generate unit tests", "Optimize for performance", "Document this code"],
    Documentation: ["Generate code examples", "Create a quick-start guide", "Summarize key points", "Generate an FAQ"],
    Insight: ["Generate a detailed report", "Create a structured analysis", "Summarize key findings", "Suggest implementation steps"],
  };
  return suggestions[mode] ?? suggestions["Report"];
}

function parseAiJson(raw: string): { report: string; code: string; docs: string; insights: string } | null {
  try {
    // Strip code fences if AI wrapped it
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const parsed = JSON.parse(cleaned);
    if (typeof parsed.report === "string" && typeof parsed.code === "string") {
      return {
        report: parsed.report ?? "",
        code: parsed.code ?? "",
        docs: parsed.docs ?? "",
        insights: parsed.insights ?? "",
      };
    }
  } catch {
    // Fall through
  }
  return null;
}

function buildFallbackContent(raw: string): { report: string; code: string; docs: string; insights: string } {
  return {
    report: raw,
    code: raw,
    docs: raw,
    insights: raw,
  };
}

router.post("/generate", async (req, res): Promise<void> => {
  const auth = extractUser(req);
  const {
    prompt,
    mode = "Report",
    template = "general",
    chatId,
    fileContent,
    guestSessionId,
  } = req.body as {
    prompt: string;
    mode?: string;
    template?: string;
    chatId?: number | null;
    fileContent?: string | null;
    guestSessionId?: string | null;
  };

  if (!prompt?.trim()) {
    res.status(400).json({ error: "prompt is required" });
    return;
  }

  const userMessage = fileContent
    ? `${prompt}\n\n---\nAttached File Content:\n${fileContent}`
    : prompt;

  let chatHistory: { role: "user" | "assistant"; content: string }[] = [];

  if (chatId) {
    const prevMessages = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.chatId, chatId))
      .orderBy(messagesTable.createdAt);

    chatHistory = prevMessages.slice(-6).map((m) => ({
      role: m.role === "ai" ? "assistant" : ("user" as "user" | "assistant"),
      content: m.role === "ai"
        ? (() => {
            try {
              const p = JSON.parse(m.content);
              return p.report ?? m.content;
            } catch { return m.content; }
          })()
        : m.content,
    }));
  }

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: buildSystemPrompt(template) },
    ...chatHistory,
    { role: "user", content: userMessage },
  ];

  const completion = await openai.chat.completions.create({
    model: "gpt-5.2",
    max_completion_tokens: 6000,
    messages,
  });

  const rawContent = completion.choices[0]?.message?.content ?? "";

  // Parse the structured JSON response
  const parsed = parseAiJson(rawContent) ?? buildFallbackContent(rawContent);

  const keywords = extractKeywords(parsed.report);
  const suggestions = getSuggestions(mode);

  // Store all 4 outputs as JSON in the AI message
  const aiMessageContent = JSON.stringify(parsed);

  let resolvedChatId = chatId ?? null;
  let aiMsgId: number | null = null;
  const normalizedMode = mode;

  if (resolvedChatId) {
    await db.insert(messagesTable).values({
      chatId: resolvedChatId,
      role: "user",
      content: userMessage,
      mode: normalizedMode,
      keywords: null,
    });
    const [aiMsg] = await db
      .insert(messagesTable)
      .values({ chatId: resolvedChatId, role: "ai", content: aiMessageContent, mode: normalizedMode, keywords: keywords.join(",") })
      .returning();
    aiMsgId = aiMsg.id;
    await db.update(chatsTable).set({ updatedAt: new Date(), mode: normalizedMode, template }).where(eq(chatsTable.id, resolvedChatId));
  } else {
    const titleWords = prompt.split(" ").slice(0, 6).join(" ");
    const chatTitle = titleWords.length > 3 ? titleWords : `New ${normalizedMode} chat`;
    const [newChat] = await db
      .insert(chatsTable)
      .values({ title: chatTitle, mode: normalizedMode, template, userId: auth?.userId ?? null, guestSessionId: auth ? null : (guestSessionId ?? null) })
      .returning();
    resolvedChatId = newChat.id;
    await db.insert(messagesTable).values({ chatId: resolvedChatId, role: "user", content: userMessage, mode: normalizedMode, keywords: null });
    const [aiMsg] = await db
      .insert(messagesTable)
      .values({ chatId: resolvedChatId, role: "ai", content: aiMessageContent, mode: normalizedMode, keywords: keywords.join(",") })
      .returning();
    aiMsgId = aiMsg.id;
  }

  const titleWords = prompt.split(" ").slice(0, 6).join(" ");
  const title = titleWords.length > 3 ? titleWords : `New ${normalizedMode} chat`;

  res.json({
    report: parsed.report,
    code: parsed.code,
    docs: parsed.docs,
    insights: parsed.insights,
    keywords,
    suggestions,
    messageId: aiMsgId,
    chatId: resolvedChatId,
    title,
  });
});

export default router;
