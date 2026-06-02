import { pgTable, text, serial, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { agentWalletsTable } from "./wallets";

export const auditLogTable = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  walletId: integer("wallet_id").notNull().references(() => agentWalletsTable.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  txHash: text("tx_hash"),
  amountShannons: text("amount_shannons"),
  status: text("status").notNull().default("success"),
  blockedReason: text("blocked_reason"),
  details: jsonb("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAuditLogSchema = createInsertSchema(auditLogTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogTable.$inferSelect;
