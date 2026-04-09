import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const savedOutputsTable = pgTable("saved_outputs", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  mode: text("mode").notNull().default("report"),
  chatId: integer("chat_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const shareLinksTable = pgTable("share_links", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  mode: text("mode").notNull().default("report"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const filesTable = pgTable("files", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  content: text("content").notNull(),
  chatId: integer("chat_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSavedOutputSchema = createInsertSchema(savedOutputsTable).omit({ id: true, createdAt: true });
export type InsertSavedOutput = z.infer<typeof insertSavedOutputSchema>;
export type SavedOutput = typeof savedOutputsTable.$inferSelect;

export const insertShareLinkSchema = createInsertSchema(shareLinksTable).omit({ id: true, createdAt: true });
export type InsertShareLink = z.infer<typeof insertShareLinkSchema>;
export type ShareLink = typeof shareLinksTable.$inferSelect;

export const insertFileSchema = createInsertSchema(filesTable).omit({ id: true, createdAt: true });
export type InsertFile = z.infer<typeof insertFileSchema>;
export type FileRecord = typeof filesTable.$inferSelect;
