import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { agentWalletsTable } from "./wallets";

export const fiberChannelsTable = pgTable("fiber_channels", {
  id: serial("id").primaryKey(),
  walletId: integer("wallet_id").notNull().references(() => agentWalletsTable.id, { onDelete: "cascade" }),
  channelId: text("channel_id"),
  peerAddress: text("peer_address").notNull(),
  localCapacityShannons: text("local_capacity_shannons").notNull(),
  remoteCapacityShannons: text("remote_capacity_shannons"),
  status: text("status").notNull().default("pending"),
  txHash: text("tx_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertFiberChannelSchema = createInsertSchema(fiberChannelsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertFiberChannel = z.infer<typeof insertFiberChannelSchema>;
export type FiberChannel = typeof fiberChannelsTable.$inferSelect;
