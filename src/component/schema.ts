import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const callStatus = v.union(
  v.literal("ok"),
  v.literal("error"),
  v.literal("fallback"),
);

export const costSource = v.union(
  v.literal("reported"),
  v.literal("estimated"),
  v.literal("none"),
);

export default defineSchema({
  calls: defineTable({
    customer: v.string(),
    call: v.string(),
    feature: v.string(),
    model: v.string(),
    status: callStatus,
    inputTokens: v.number(),
    outputTokens: v.number(),
    costUsd: v.number(),
    costSource,
    latencyMs: v.number(),
    runId: v.optional(v.string()),
    plan: v.optional(v.string()),
    error: v.optional(v.string()),
    at: v.number(),
  })
    .index("by_customer_at", ["customer", "at"])
    .index("by_run", ["runId"])
    .index("by_at", ["at"]),

  daily: defineTable({
    day: v.string(),
    customer: v.string(),
    call: v.string(),
    feature: v.string(),
    calls: v.number(),
    errors: v.number(),
    fallbacks: v.number(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    costUsd: v.number(),
    latencyMs: v.number(),
  })
    .index("by_day", ["day"])
    .index("by_customer_day", ["customer", "day"])
    .index("by_customer_call_day", ["customer", "call", "day"]),

  budgets: defineTable({
    customer: v.string(),
    monthlyUsd: v.number(),
    updatedAt: v.number(),
  }).index("by_customer", ["customer"]),
});
