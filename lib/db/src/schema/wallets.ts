import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const agentWalletsTable = pgTable("agent_wallets", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address").notNull(),
  publicKey: text("public_key").notNull(),
  encryptedPrivateKey: text("encrypted_private_key").notNull(),
  network: text("network").notNull().default("testnet"),
  isKilled: boolean("is_killed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAgentWalletSchema = createInsertSchema(agentWalletsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAgentWallet = z.infer<typeof insertAgentWalletSchema>;
export type AgentWallet = typeof agentWalletsTable.$inferSelect;
