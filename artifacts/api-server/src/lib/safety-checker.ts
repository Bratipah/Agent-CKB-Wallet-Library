import { db, safetyRulesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const ALL_ACTIONS = ["transfer", "sign", "fiber_open", "fiber_pay", "dob_mint", "otx_compose"] as const;
type Action = (typeof ALL_ACTIONS)[number];

export interface SafetyCheckResult {
  allowed: boolean;
  reason?: string;
}

export async function checkSafetyRules(
  walletId: number,
  isKilled: boolean,
  action: Action,
  amountShannons?: string,
  toAddress?: string,
): Promise<SafetyCheckResult> {
  if (isKilled) {
    return { allowed: false, reason: "Kill switch is active — all operations are disabled" };
  }

  const [rules] = await db.select().from(safetyRulesTable).where(eq(safetyRulesTable.walletId, walletId));
  if (!rules) {
    logger.warn({ walletId }, "No safety rules found, allowing by default");
    return { allowed: true };
  }

  if (!rules.isActive) {
    return { allowed: false, reason: "Safety rules are disabled" };
  }

  // Action whitelist check
  const allowedActions = rules.allowedActions ?? ALL_ACTIONS;
  if (!allowedActions.includes(action)) {
    return {
      allowed: false,
      reason: `Action "${action}" is not in the allowed actions whitelist`,
    };
  }

  // Address whitelist check (only for transfer)
  if (action === "transfer" && toAddress && rules.addressWhitelist && rules.addressWhitelist.length > 0) {
    if (!rules.addressWhitelist.includes(toAddress)) {
      return {
        allowed: false,
        reason: `Address ${toAddress} is not in the address whitelist`,
      };
    }
  }

  if (amountShannons) {
    const amount = BigInt(amountShannons);

    // Per-transaction limit
    if (rules.maxTransferAmountShannons) {
      const maxAmount = BigInt(rules.maxTransferAmountShannons);
      if (amount > maxAmount) {
        return {
          allowed: false,
          reason: `Transfer amount (${formatCkb(amountShannons)} CKB) exceeds per-transaction limit (${formatCkb(rules.maxTransferAmountShannons)} CKB)`,
        };
      }
    }

    // Daily spending limit check
    if (rules.dailySpendingLimitShannons) {
      const dailyLimit = BigInt(rules.dailySpendingLimitShannons);
      const today = new Date().toISOString().split("T")[0];

      // Reset daily spent if it's a new day
      let dailySpent = BigInt(0);
      if (rules.dailySpentDate === today) {
        dailySpent = BigInt(rules.dailySpentShannons ?? "0");
      }

      if (dailySpent + amount > dailyLimit) {
        return {
          allowed: false,
          reason: `Daily spending limit reached (${formatCkb(dailySpent.toString())} + ${formatCkb(amountShannons)} > ${formatCkb(rules.dailySpendingLimitShannons)} CKB)`,
        };
      }
    }
  }

  return { allowed: true };
}

export async function recordSpending(walletId: number, amountShannons: string): Promise<void> {
  const [rules] = await db.select().from(safetyRulesTable).where(eq(safetyRulesTable.walletId, walletId));
  if (!rules) return;

  const today = new Date().toISOString().split("T")[0];
  const prevSpent = rules.dailySpentDate === today ? BigInt(rules.dailySpentShannons ?? "0") : BigInt(0);
  const newSpent = (prevSpent + BigInt(amountShannons)).toString();

  await db
    .update(safetyRulesTable)
    .set({ dailySpentShannons: newSpent, dailySpentDate: today })
    .where(eq(safetyRulesTable.walletId, walletId));
}

function formatCkb(shannons: string): string {
  const n = Number(BigInt(shannons)) / 1e8;
  return n.toFixed(2);
}
