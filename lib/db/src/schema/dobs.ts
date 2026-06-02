import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { agentWalletsTable } from "./wallets";

export const dobAssetsTable = pgTable("dob_assets", {
  id: serial("id").primaryKey(),
  walletId: integer("wallet_id").notNull().references(() => agentWalletsTable.id, { onDelete: "cascade" }),
  tokenId: text("token_id"),
  name: text("name").notNull(),
  description: text("description"),
  contentType: text("content_type"),
  content: text("content"),
  clusterName: text("cluster_name"),
  txHash: text("tx_hash"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDobAssetSchema = createInsertSchema(dobAssetsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertDobAsset = z.infer<typeof insertDobAssetSchema>;
export type DobAsset = typeof dobAssetsTable.$inferSelect;
