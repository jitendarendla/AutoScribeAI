import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const chatsTable = pgTable("chats", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  guestSessionId: text("guest_session_id"),
  title: text("title").notNull().default("New Chat"),
  mode: text("mode").notNull().default("report"),
  template: text("template").notNull().default("general"),
  prompt: text("prompt"),
  reportOutput: text("report_output"),
  codeOutput: text("code_output"),
  docsOutput: text("docs_output"),
  insightsOutput: text("insights_output"),
  keywords: text("keywords"),
  isSaved: boolean("is_saved").notNull().default(false),
  shareToken: text("share_token"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const messagesTable = pgTable("messages", {
  id: serial("id").primaryKey(),
  chatId: integer("chat_id").notNull().references(() => chatsTable.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  mode: text("mode").notNull().default("report"),
  keywords: text("keywords"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertChatSchema = createInsertSchema(chatsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertChat = z.infer<typeof insertChatSchema>;
export type Chat = typeof chatsTable.$inferSelect;

export const insertMessageSchema = createInsertSchema(messagesTable).omit({ id: true, createdAt: true });
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messagesTable.$inferSelect;
