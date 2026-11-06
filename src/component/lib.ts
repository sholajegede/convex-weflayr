import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel.js";
import { mutation, query, type QueryCtx } from "./_generated/server.js";
import { callStatus, costSource } from "./schema.js";

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function dayOf(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

function assertDay(value: string, name: string) {
  if (!DAY_PATTERN.test(value)) {
    throw new Error(
      `${name} must be a UTC day written YYYY-MM-DD, got "${value}".`,
    );
  }
}

function assertMonth(value: string) {
  if (!MONTH_PATTERN.test(value)) {
    throw new Error(`month must be written YYYY-MM, got "${value}".`);
  }
}

type Totals = {
  calls: number;
  errors: number;
  fallbacks: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
};

function emptyTotals(): Totals {
  return {
    calls: 0,
    errors: 0,
    fallbacks: 0,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    latencyMs: 0,
  };
}

function add(into: Totals, row: Doc<"daily">) {
  into.calls += row.calls;
  into.errors += row.errors;
  into.fallbacks += row.fallbacks;
  into.inputTokens += row.inputTokens;
  into.outputTokens += row.outputTokens;
  into.costUsd += row.costUsd;
  into.latencyMs += row.latencyMs;
}

function withAverages(totals: Totals) {
  return {
    ...totals,
    averageLatencyMs: totals.calls > 0 ? totals.latencyMs / totals.calls : 0,
  };
}

const totalsValidator = {
  calls: v.number(),
  errors: v.number(),
  fallbacks: v.number(),
  inputTokens: v.number(),
  outputTokens: v.number(),
  costUsd: v.number(),
  latencyMs: v.number(),
  averageLatencyMs: v.number(),
};

async function dailyRows(
  ctx: QueryCtx,
  range: { from: string; to: string },
  customer?: string,
): Promise<Doc<"daily">[]> {
  assertDay(range.from, "from");
  assertDay(range.to, "to");
  if (customer !== undefined) {
    return await ctx.db
      .query("daily")
      .withIndex("by_customer_day", (q) =>
        q.eq("customer", customer).gte("day", range.from).lte("day", range.to),
      )
      .collect();
  }
  return await ctx.db
    .query("daily")
    .withIndex("by_day", (q) => q.gte("day", range.from).lte("day", range.to))
    .collect();
}

export const record = mutation({
  args: {
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
    requestedModel: v.optional(v.string()),
    warnings: v.optional(v.string()),
    at: v.optional(v.number()),
  },
  returns: v.id("calls"),
  handler: async (ctx, args) => {
    const at = args.at ?? Date.now();
    const { at: _at, ...entry } = args;
    const id = await ctx.db.insert("calls", { ...entry, at });

    const day = dayOf(at);
    const existing = await ctx.db
      .query("daily")
      .withIndex("by_customer_call_day", (q) =>
        q.eq("customer", args.customer).eq("call", args.call).eq("day", day),
      )
      .unique();
    const delta = {
      calls: 1,
      errors: args.status === "error" ? 1 : 0,
      fallbacks: args.status === "fallback" ? 1 : 0,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      costUsd: args.costUsd,
      latencyMs: args.latencyMs,
    };
    if (existing) {
      await ctx.db.patch(existing._id, {
        feature: args.feature,
        calls: existing.calls + delta.calls,
        errors: existing.errors + delta.errors,
        fallbacks: existing.fallbacks + delta.fallbacks,
        inputTokens: existing.inputTokens + delta.inputTokens,
        outputTokens: existing.outputTokens + delta.outputTokens,
        costUsd: existing.costUsd + delta.costUsd,
        latencyMs: existing.latencyMs + delta.latencyMs,
      });
    } else {
      await ctx.db.insert("daily", {
        day,
        customer: args.customer,
        call: args.call,
        feature: args.feature,
        ...delta,
      });
    }
    return id;
  },
});

export const usageByCustomer = query({
  args: { from: v.string(), to: v.string() },
  returns: v.array(v.object({ customer: v.string(), ...totalsValidator })),
  handler: async (ctx, args) => {
    const rows = await dailyRows(ctx, args);
    const byCustomer = new Map<string, Totals>();
    for (const row of rows) {
      const totals = byCustomer.get(row.customer) ?? emptyTotals();
      add(totals, row);
      byCustomer.set(row.customer, totals);
    }
    return [...byCustomer.entries()]
      .map(([customer, totals]) => ({ customer, ...withAverages(totals) }))
      .sort((a, b) => b.costUsd - a.costUsd);
  },
});

export const usageByCall = query({
  args: { from: v.string(), to: v.string(), customer: v.optional(v.string()) },
  returns: v.array(
    v.object({ call: v.string(), feature: v.string(), ...totalsValidator }),
  ),
  handler: async (ctx, args) => {
    const rows = await dailyRows(ctx, args, args.customer);
    const byCall = new Map<string, { feature: string; totals: Totals }>();
    for (const row of rows) {
      const entry = byCall.get(row.call) ?? {
        feature: row.feature,
        totals: emptyTotals(),
      };
      add(entry.totals, row);
      byCall.set(row.call, entry);
    }
    return [...byCall.entries()]
      .map(([call, entry]) => ({
        call,
        feature: entry.feature,
        ...withAverages(entry.totals),
      }))
      .sort((a, b) => b.costUsd - a.costUsd);
  },
});

export const usageByFeature = query({
  args: { from: v.string(), to: v.string(), customer: v.optional(v.string()) },
  returns: v.array(v.object({ feature: v.string(), ...totalsValidator })),
  handler: async (ctx, args) => {
    const rows = await dailyRows(ctx, args, args.customer);
    const byFeature = new Map<string, Totals>();
    for (const row of rows) {
      const totals = byFeature.get(row.feature) ?? emptyTotals();
      add(totals, row);
      byFeature.set(row.feature, totals);
    }
    return [...byFeature.entries()]
      .map(([feature, totals]) => ({ feature, ...withAverages(totals) }))
      .sort((a, b) => b.costUsd - a.costUsd);
  },
});

export const usageByDay = query({
  args: { from: v.string(), to: v.string(), customer: v.optional(v.string()) },
  returns: v.array(v.object({ day: v.string(), ...totalsValidator })),
  handler: async (ctx, args) => {
    const rows = await dailyRows(ctx, args, args.customer);
    const byDay = new Map<string, Totals>();
    for (const row of rows) {
      const totals = byDay.get(row.day) ?? emptyTotals();
      add(totals, row);
      byDay.set(row.day, totals);
    }
    return [...byDay.entries()]
      .map(([day, totals]) => ({ day, ...withAverages(totals) }))
      .sort((a, b) => a.day.localeCompare(b.day));
  },
});

const callValidator = v.object({
  _id: v.id("calls"),
  _creationTime: v.number(),
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
  requestedModel: v.optional(v.string()),
  warnings: v.optional(v.string()),
  at: v.number(),
});

export const recentCalls = query({
  args: { customer: v.optional(v.string()), limit: v.optional(v.number()) },
  returns: v.array(callValidator),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 500);
    if (args.customer !== undefined) {
      const customer = args.customer;
      return await ctx.db
        .query("calls")
        .withIndex("by_customer_at", (q) => q.eq("customer", customer))
        .order("desc")
        .take(limit);
    }
    return await ctx.db
      .query("calls")
      .withIndex("by_at")
      .order("desc")
      .take(limit);
  },
});

export const runCost = query({
  args: { runId: v.string() },
  returns: v.object({
    ...totalsValidator,
    steps: v.array(
      v.object({
        call: v.string(),
        model: v.string(),
        costUsd: v.number(),
        latencyMs: v.number(),
        status: callStatus,
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("calls")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .collect();
    const totals = emptyTotals();
    for (const row of rows) {
      totals.calls += 1;
      totals.errors += row.status === "error" ? 1 : 0;
      totals.fallbacks += row.status === "fallback" ? 1 : 0;
      totals.inputTokens += row.inputTokens;
      totals.outputTokens += row.outputTokens;
      totals.costUsd += row.costUsd;
      totals.latencyMs += row.latencyMs;
    }
    return {
      ...withAverages(totals),
      steps: rows
        .sort((a, b) => a.at - b.at)
        .map((row) => ({
          call: row.call,
          model: row.model,
          costUsd: row.costUsd,
          latencyMs: row.latencyMs,
          status: row.status,
        })),
    };
  },
});

export const setBudget = mutation({
  args: { customer: v.string(), monthlyUsd: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!Number.isFinite(args.monthlyUsd) || args.monthlyUsd < 0) {
      throw new Error("monthlyUsd must be a number that is zero or more.");
    }
    const existing = await ctx.db
      .query("budgets")
      .withIndex("by_customer", (q) => q.eq("customer", args.customer))
      .unique();
    const row = {
      customer: args.customer,
      monthlyUsd: args.monthlyUsd,
      updatedAt: Date.now(),
    };
    if (existing) await ctx.db.patch(existing._id, row);
    else await ctx.db.insert("budgets", row);
    return null;
  },
});

export const clearBudget = mutation({
  args: { customer: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("budgets")
      .withIndex("by_customer", (q) => q.eq("customer", args.customer))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    return null;
  },
});

const syncedValidator = v.object({
  customer: v.string(),
  month: v.string(),
  costUsd: v.number(),
  revenue: v.union(v.number(), v.null()),
  marginPct: v.union(v.number(), v.null()),
  riskStatus: v.union(v.string(), v.null()),
  syncedAt: v.number(),
});

async function syncedRow(ctx: QueryCtx, customer: string, month: string) {
  return await ctx.db
    .query("synced")
    .withIndex("by_customer_month", (q) =>
      q.eq("customer", customer).eq("month", month),
    )
    .unique();
}

export const saveSynced = mutation({
  args: {
    month: v.string(),
    syncedAt: v.number(),
    rows: v.array(
      v.object({
        customer: v.string(),
        costUsd: v.number(),
        revenue: v.union(v.number(), v.null()),
        marginPct: v.union(v.number(), v.null()),
        riskStatus: v.union(v.string(), v.null()),
      }),
    ),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    assertMonth(args.month);
    for (const row of args.rows) {
      const existing = await syncedRow(ctx, row.customer, args.month);
      const value = { ...row, month: args.month, syncedAt: args.syncedAt };
      if (existing) await ctx.db.patch(existing._id, value);
      else await ctx.db.insert("synced", value);
    }
    return args.rows.length;
  },
});

export const customerStatus = query({
  args: { customer: v.string(), month: v.string() },
  returns: v.union(syncedValidator, v.null()),
  handler: async (ctx, args) => {
    assertMonth(args.month);
    const row = await syncedRow(ctx, args.customer, args.month);
    if (!row) return null;
    const { _id, _creationTime, ...status } = row;
    return status;
  },
});

export const syncedCustomers = query({
  args: { month: v.string(), limit: v.optional(v.number()) },
  returns: v.array(syncedValidator),
  handler: async (ctx, args) => {
    assertMonth(args.month);
    const rows = await ctx.db
      .query("synced")
      .withIndex("by_month", (q) => q.eq("month", args.month))
      .take(Math.min(Math.max(args.limit ?? 500, 1), 2000));
    return rows.map(({ _id, _creationTime, ...status }) => status);
  },
});

export const budgetStatus = query({
  args: {
    customer: v.string(),
    month: v.string(),
    settleMs: v.optional(v.number()),
  },
  returns: v.object({
    customer: v.string(),
    month: v.string(),
    limitUsd: v.union(v.number(), v.null()),
    spentUsd: v.number(),
    remainingUsd: v.union(v.number(), v.null()),
    allowed: v.boolean(),
    source: v.union(v.literal("weflayr"), v.literal("local")),
    riskStatus: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    assertMonth(args.month);
    const budget = await ctx.db
      .query("budgets")
      .withIndex("by_customer", (q) => q.eq("customer", args.customer))
      .unique();
    const synced = await syncedRow(ctx, args.customer, args.month);
    let spentUsd: number;
    if (synced) {
      // Weflayr's real cost, plus calls stored since shortly before the last sync, which Weflayr may not have recorded yet.
      const since = synced.syncedAt - (args.settleMs ?? 300_000);
      const recent = await ctx.db
        .query("calls")
        .withIndex("by_customer_at", (q) =>
          q.eq("customer", args.customer).gt("at", since),
        )
        .collect();
      spentUsd =
        synced.costUsd +
        recent
          .filter((row) => dayOf(row.at).startsWith(args.month))
          .reduce((sum, row) => sum + row.costUsd, 0);
    } else {
      const rows = await dailyRows(
        ctx,
        { from: `${args.month}-01`, to: `${args.month}-31` },
        args.customer,
      );
      spentUsd = rows.reduce((sum, row) => sum + row.costUsd, 0);
    }
    const limitUsd = budget?.monthlyUsd ?? null;
    return {
      customer: args.customer,
      month: args.month,
      limitUsd,
      spentUsd,
      remainingUsd: limitUsd === null ? null : Math.max(limitUsd - spentUsd, 0),
      allowed: limitUsd === null || spentUsd < limitUsd,
      source: synced ? ("weflayr" as const) : ("local" as const),
      riskStatus: synced?.riskStatus ?? null,
    };
  },
});

export const purge = mutation({
  args: { before: v.number(), limit: v.optional(v.number()) },
  returns: v.object({ deleted: v.number(), hasMore: v.boolean() }),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 500, 1), 2000);
    const old = await ctx.db
      .query("calls")
      .withIndex("by_at", (q) => q.lt("at", args.before))
      .take(limit + 1);
    const batch = old.slice(0, limit);
    for (const row of batch) await ctx.db.delete(row._id);
    return { deleted: batch.length, hasMore: old.length > limit };
  },
});
