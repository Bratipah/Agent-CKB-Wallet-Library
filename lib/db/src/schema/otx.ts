import { pgTable, text, serial, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { agentWalletsTable } from "./wallets";

export const otxIntentsTable = pgTable("otx_intents", {
  id: serial("id").primaryKey(),
  walletId: integer("wallet_id").notNull().references(() => agentWalletsTable.id, { onDelete: "cascade" }),
  intentType: text("intent_type").notNull(),
  intentData: jsonb("intent_data"),
  status: text("status").notNull().default("pending"),
  txHash: text("tx_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertOtxIntentSchema = createInsertSchema(otxIntentsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertOtxIntent = z.infer<typeof insertOtxIntentSchema>;
export type OtxIntent = typeof otxIntentsTable.$inferSelect;
