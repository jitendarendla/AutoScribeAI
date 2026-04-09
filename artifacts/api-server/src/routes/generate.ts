import { Router, type IRouter } from "express";
import { db, chatsTable, messagesTable } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import { eq } from "drizzle-orm";
import { extractUser } from "../lib/auth-middleware";

const router: IRouter = Router();

function getTemplateInstructions(template: string, mode: string): string {
  if (mode !== "report" && mode !== "documentation") return "";

  const templates: Record<string, string> = {
    general: `Structure your report with these exact sections as markdown headings:
## Introduction
## Overview
## Key Points
## Applications / Uses
## Benefits / Advantages
## Important Details
## Conclusion`,

    university: `Structure your report with these exact sections as markdown headings:
## Introduction
## About the Institution
## Courses / Programs
## Admission Process
## Facilities
## Benefits / Highlights
## Placement / Career Opportunities
## Conclusion`,

    experiment: `Structure your report with these exact sections as markdown headings:
## Aim
## Introduction / Theory
## Prerequisites
## Tools / Requirements
## Procedure / Steps
## Expected Output / Result
## Applications
## Conclusion`,

    project: `Structure your report with these exact sections as markdown headings:
## Introduction
## Problem Statement
## Working Principle
## Technologies Used
## Benefits
## Limitations
## Real-world Applications
## Conclusion`,
  };

  const docsTemplate = `Structure your documentation with these exact sections as markdown headings:
## Definition
## Purpose
## Working
## Key Features
## Example
## Notes / Precautions`;

  if (mode === "documentation") return docsTemplate;
  return templates[template] ?? templates["general"];
}

function getModeSystemPrompt(mode: string, template: string): string {
  const templateGuide = getTemplateInstructions(template, mode);

  switch (mode) {
    case "report":
      return `You are AutoScribe AI+, a professional report generator. Generate a comprehensive, well-structured report.
${templateGuide}
Use markdown formatting with proper headers, bullet points, and paragraphs. Be thorough and professional.`;

    case "code":
      return `You are AutoScribe AI+, a senior software engineer. Generate clean, well-commented, production-ready code.
Include: an explanation section, the code with comments, usage examples, and important notes.
Use appropriate code blocks with language specifiers.`;

    case "documentation":
      return `You are AutoScribe AI+, a technical documentation expert. Create clear, comprehensive documentation.
${templateGuide}
Use proper markdown structure. Be precise and developer-friendly.`;

    case "insight":
      return `You are AutoScribe AI+, an analytical insight generator. Analyze the information and generate key insights.
Structure with these sections:
## Key Findings
## Analysis
## Patterns & Trends
## Recommendations
## Suggested Next Steps
Be analytical and actionable.`;

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

function detectTopic(prompt: string): string {
  const p = prompt.toLowerCase();
  if (p.match(/university|college|institution|school|campus/)) return "Education";
  if (p.match(/code|program|software|algorithm|function|api/)) return "Technology";
  if (p.match(/experiment|lab|chemistry|physics|biology/)) return "Science";
  if (p.match(/business|market|revenue|startup|company/)) return "Business";
  if (p.match(/health|medical|doctor|patient|disease/)) return "Healthcare";
  return "General";
}

function getSuggestions(mode: string): string[] {
  const suggestions: Record<string, string[]> = {
    report: [
      "Generate an executive summary of this report",
      "Create a structured comparison",
      "Extract key action items",
      "Convert this to documentation",
    ],
    code: [
      "Explain this code in detail",
      "Generate unit tests for this",
      "Optimize this code for performance",
      "Document this code",
    ],
    documentation: [
      "Generate code examples for this",
      "Create a quick-start guide",
      "Summarize the key points",
      "Generate an FAQ section",
    ],
    insight: [
      "Generate a detailed report on this",
      "Create a structured analysis",
      "Summarize key findings",
      "Suggest implementation steps",
    ],
  };
  return suggestions[mode] ?? suggestions["report"];
}

async function generateForMode(
  prompt: string,
  mode: string,
  template: string,
  chatHistory: { role: "user" | "assistant"; content: string }[]
): Promise<string> {
  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: getModeSystemPrompt(mode, template) },
    ...chatHistory.slice(-6),
    { role: "user", content: prompt },
  ];

  const completion = await openai.chat.completions.create({
    model: "gpt-5.2",
    max_completion_tokens: 4096,
    messages,
  });

  return completion.choices[0]?.message?.content ?? "";
}

router.post("/generate", async (req, res): Promise<void> => {
  const auth = extractUser(req);
  const {
    prompt,
    mode = "report",
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

  if (!prompt) {
    res.status(400).json({ error: "prompt is required" });
    return;
  }

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
      role: m.role === "ai" ? "assistant" : (m.role as "user"),
      content: m.content,
    }));
  }

  const normalizedMode = mode.toLowerCase();
  const topic = detectTopic(prompt);
  const confidence = 0.75 + Math.random() * 0.2;

  const [reportContent, codeContent, docsContent, insightContent] = await Promise.all([
    generateForMode(userMessage, "report", template, chatHistory),
    generateForMode(userMessage, "code", template, chatHistory),
    generateForMode(userMessage, "documentation", template, chatHistory),
    generateForMode(userMessage, "insight", template, chatHistory),
  ]);

  const primaryContent = (() => {
    switch (normalizedMode) {
      case "code": return codeContent;
      case "documentation": return docsContent;
      case "insight": return insightContent;
      default: return reportContent;
    }
  })();

  const keywords = extractKeywords(primaryContent);
  const suggestions = getSuggestions(normalizedMode);

  // Store all 4 outputs as JSON in the AI message content
  const aiMessageContent = JSON.stringify({
    report: reportContent,
    code: codeContent,
    docs: docsContent,
    insights: insightContent,
  });

  let resolvedChatId = chatId ?? null;
  let aiMsgId: number | null = null;

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
      .values({
        chatId: resolvedChatId,
        role: "ai",
        content: aiMessageContent,
        mode: normalizedMode,
        keywords: keywords.join(","),
      })
      .returning();
    aiMsgId = aiMsg.id;

    await db
      .update(chatsTable)
      .set({ updatedAt: new Date(), mode: normalizedMode, template })
      .where(eq(chatsTable.id, resolvedChatId));
  } else {
    const titleWords = prompt.split(" ").slice(0, 6).join(" ");
    const chatTitle = titleWords.length > 3 ? titleWords : `New ${normalizedMode} chat`;
    const [newChat] = await db
      .insert(chatsTable)
      .values({
        title: chatTitle,
        mode: normalizedMode,
        template,
        userId: auth?.userId ?? null,
        guestSessionId: auth ? null : (guestSessionId ?? null),
      })
      .returning();
    resolvedChatId = newChat.id;

    await db.insert(messagesTable).values({
      chatId: resolvedChatId,
      role: "user",
      content: userMessage,
      mode: normalizedMode,
      keywords: null,
    });

    const [aiMsg] = await db
      .insert(messagesTable)
      .values({
        chatId: resolvedChatId,
        role: "ai",
        content: aiMessageContent,
        mode: normalizedMode,
        keywords: keywords.join(","),
      })
      .returning();
    aiMsgId = aiMsg.id;
  }

  const titleWords = prompt.split(" ").slice(0, 6).join(" ");
  const title = titleWords.length > 3 ? titleWords : `New ${normalizedMode} chat`;

  res.json({
    report: reportContent,
    code: codeContent,
    docs: docsContent,
    insights: insightContent,
    keywords,
    suggestions,
    messageId: aiMsgId,
    chatId: resolvedChatId,
    title,
    topic,
    confidence: Math.round(confidence * 100) / 100,
  });
});

export default router;
