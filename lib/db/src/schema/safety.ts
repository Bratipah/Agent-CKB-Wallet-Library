import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { agentWalletsTable } from "./wallets";

export const safetyRulesTable = pgTable("safety_rules", {
  id: serial("id").primaryKey(),
  walletId: integer("wallet_id").notNull().references(() => agentWalletsTable.id, { onDelete: "cascade" }),
  maxTransferAmountShannons: text("max_transfer_amount_shannons"),
  dailySpendingLimitShannons: text("daily_spending_limit_shannons"),
  dailySpentShannons: text("daily_spent_shannons").notNull().default("0"),
  dailySpentDate: text("daily_spent_date"),
  allowedActions: text("allowed_actions").array().notNull().default(["transfer", "sign", "fiber_open", "fiber_pay", "dob_mint", "otx_compose"]),
  addressWhitelist: text("address_whitelist").array().notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSafetyRulesSchema = createInsertSchema(safetyRulesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSafetyRules = z.infer<typeof insertSafetyRulesSchema>;
export type SafetyRules = typeof safetyRulesTable.$inferSelect;
