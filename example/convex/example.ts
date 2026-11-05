import { generateText } from "ai";
import { v } from "convex/values";
import {
  Weflayr,
  WeflayrBudgetError,
  lastDays,
  newRunId,
} from "convex-weflayr";
import { weflayrModel } from "convex-weflayr/ai-sdk";
import { components } from "./_generated/api.js";
import { action, query, type ActionCtx } from "./_generated/server.js";

/**
 * Bring your own key. Each visitor pastes their own Weflayr key in the browser and it is sent
 * with every call. It is used for that call and never written to a table.
 * Each visitor also gets a random id, so calls and budgets of different visitors never mix.
 */

const MODEL = "claude-haiku-5-5";

const options = {
  features: {
    "draft-reply": "support-replies",
    "classify-ticket": "support-replies",
    "summarise-thread": "thread-summaries",
    "plan-task": "agent-runs",
    "search-docs": "agent-runs",
    "write-answer": "agent-runs",
    "verify-answer": "agent-runs",
  },
  // Dollars per million tokens. Weflayr's dashboard shows $0.10 in and $0.50 out for this model.
  prices: { [MODEL]: { inputPerMillion: 0.1, outputPerMillion: 0.5 } },
};

/** No key: used for reading numbers and for budgets, which never call the gateway. */
const reader = new Weflayr(components.weflayr, options);

/** A client that carries the visitor's own key. */
function withKey(apiKey: string) {
  return new Weflayr(components.weflayr, { ...options, apiKey, allow: "*" });
}

const scoped = (visitor: string, name: string) => `${visitor}/${name}`;

const AGENT_STEPS = [
  {
    call: "plan-task",
    prompt:
      "In one short sentence, plan how to answer this support question: how do I reset my password?",
  },
  {
    call: "search-docs",
    prompt:
      "List two help articles that would answer: how do I reset my password? One line each.",
  },
  {
    call: "write-answer",
    prompt: "Write a three sentence answer to: how do I reset my password?",
  },
  {
    call: "verify-answer",
    prompt:
      "Reply OK if this is a clear answer to a password reset question: 'Click Forgot password on the sign-in page and follow the link in the email.'",
  },
];

function explain(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/401|unauthori[sz]ed|invalid.*key/i.test(message)) {
    return "Weflayr did not accept this key. Check that you copied the whole key.";
  }
  if (/402|balance|credit/i.test(message)) {
    return "Your Weflayr balance is empty. Add credit in the Weflayr dashboard.";
  }
  return message.slice(0, 300);
}

function overBudget(name: string, error: WeflayrBudgetError): string {
  const fmt = (value: number) => `$${Number(value.toFixed(6))}`;
  return `${name} has used ${fmt(error.spentUsd)} of its ${fmt(error.limitUsd)} monthly budget.`;
}

type Meta = {
  customerId: string;
  plan: string;
  call: string;
  prompt: string;
  runId?: string;
};

async function runCall(ctx: ActionCtx, weflayr: Weflayr, meta: Meta) {
  const callMeta = {
    customer: meta.customerId,
    plan: meta.plan,
    call: meta.call,
    runId: meta.runId,
  };
  const result = await weflayr.track(
    ctx,
    { ...callMeta, model: MODEL },
    () =>
      generateText({
        model: weflayrModel(weflayr, MODEL),
        headers: weflayr.headers(callMeta),
        prompt: meta.prompt,
        maxOutputTokens: 120,
      }),
  );
  const costUsd =
    weflayr.estimateCost(
      MODEL,
      result.usage?.inputTokens ?? 0,
      result.usage?.outputTokens ?? 0,
    ) ?? 0;
  return { text: result.text.trim(), costUsd };
}

/** One real call through Weflayr, after the customer's budget check. */
export const sendCall = action({
  args: {
    apiKey: v.string(),
    visitor: v.string(),
    customer: v.string(),
    plan: v.string(),
    call: v.string(),
    prompt: v.string(),
  },
  handler: async (ctx, args) => {
    const weflayr = withKey(args.apiKey);
    const customerId = scoped(args.visitor, args.customer);
    try {
      await weflayr.assertWithinBudget(ctx, customerId);
    } catch (error) {
      if (error instanceof WeflayrBudgetError) {
        return {
          status: "blocked" as const,
          message: overBudget(args.customer, error),
        };
      }
      throw error;
    }
    try {
      const done = await runCall(ctx, weflayr, {
        customerId,
        plan: args.plan,
        call: args.call,
        prompt: args.prompt,
      });
      return { status: "ok" as const, text: done.text, costUsd: done.costUsd };
    } catch (error) {
      return { status: "error" as const, message: explain(error) };
    }
  },
});

/** Four real calls under one run id. The budget is checked before every step, so a customer who runs out stops there. */
export const runAgent = action({
  args: {
    apiKey: v.string(),
    visitor: v.string(),
    customer: v.string(),
    plan: v.string(),
  },
  handler: async (ctx, args) => {
    const weflayr = withKey(args.apiKey);
    const customerId = scoped(args.visitor, args.customer);
    const runId = newRunId();
    for (const [index, step] of AGENT_STEPS.entries()) {
      try {
        await weflayr.assertWithinBudget(ctx, customerId);
      } catch (error) {
        if (error instanceof WeflayrBudgetError) {
          return {
            runId,
            stoppedAtStep: index + 1,
            message: overBudget(args.customer, error),
          };
        }
        throw error;
      }
      try {
        await runCall(ctx, weflayr, {
          customerId,
          plan: args.plan,
          call: step.call,
          prompt: step.prompt,
          runId,
        });
      } catch (error) {
        return {
          runId,
          stoppedAtStep: index + 1,
          message: explain(error),
        };
      }
    }
    return { runId, stoppedAtStep: null, message: null };
  },
});

export const setBudget = action({
  args: { visitor: v.string(), customer: v.string(), monthlyUsd: v.number() },
  handler: async (ctx, args) => {
    await reader.setBudget(
      ctx,
      scoped(args.visitor, args.customer),
      args.monthlyUsd,
    );
  },
});

export const clearBudget = action({
  args: { visitor: v.string(), customer: v.string() },
  handler: async (ctx, args) => {
    await reader.clearBudget(ctx, scoped(args.visitor, args.customer));
  },
});

// Reading the numbers. Every query takes the visitor id and the customer names, so a visitor only sees their own rows.

type Totals = {
  calls: number;
  errors: number;
  fallbacks: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  averageLatencyMs: number;
};

function sum(rows: Totals[]): Totals {
  const total = {
    calls: 0,
    errors: 0,
    fallbacks: 0,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    latencyMs: 0,
    averageLatencyMs: 0,
  };
  for (const row of rows) {
    total.calls += row.calls;
    total.errors += row.errors;
    total.fallbacks += row.fallbacks;
    total.inputTokens += row.inputTokens;
    total.outputTokens += row.outputTokens;
    total.costUsd += row.costUsd;
    total.latencyMs += row.latencyMs;
  }
  total.averageLatencyMs = total.calls ? total.latencyMs / total.calls : 0;
  return total;
}

function group<T extends Totals, M extends object>(
  rows: T[],
  keyOf: (row: T) => string,
  metaOf: (row: T) => M,
): (M & Totals)[] {
  const groups = new Map<string, { meta: M; rows: T[] }>();
  for (const row of rows) {
    const key = keyOf(row);
    const entry = groups.get(key) ?? { meta: metaOf(row), rows: [] };
    entry.rows.push(row);
    groups.set(key, entry);
  }
  return [...groups.values()].map((entry) => ({
    ...entry.meta,
    ...sum(entry.rows),
  }));
}

const scope = { visitor: v.string(), customers: v.array(v.string()) };

function targets(args: {
  visitor: string;
  customers: string[];
  customer?: string;
}) {
  const names = args.customer ? [args.customer] : args.customers;
  return names.map((name) => scoped(args.visitor, name));
}

export const costByCustomer = query({
  args: { ...scope, days: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const prefix = `${args.visitor}/`;
    const rows = await reader.usageByCustomer(ctx, lastDays(args.days ?? 30));
    return rows
      .filter((row) => row.customer.startsWith(prefix))
      .map((row) => ({ ...row, customer: row.customer.slice(prefix.length) }));
  },
});

export const costByCall = query({
  args: { ...scope, customer: v.optional(v.string()), days: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const range = lastDays(args.days ?? 30);
    const lists = await Promise.all(
      targets(args).map((id) => reader.usageByCall(ctx, range, id)),
    );
    return group(
      lists.flat(),
      (row) => row.call,
      (row) => ({ call: row.call, feature: row.feature }),
    ).sort((a, b) => b.costUsd - a.costUsd);
  },
});

export const costByFeature = query({
  args: { ...scope, customer: v.optional(v.string()), days: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const range = lastDays(args.days ?? 30);
    const lists = await Promise.all(
      targets(args).map((id) => reader.usageByFeature(ctx, range, id)),
    );
    return group(
      lists.flat(),
      (row) => row.feature,
      (row) => ({ feature: row.feature }),
    ).sort((a, b) => b.costUsd - a.costUsd);
  },
});

export const costByDay = query({
  args: { ...scope, customer: v.optional(v.string()), days: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const range = lastDays(args.days ?? 14);
    const lists = await Promise.all(
      targets(args).map((id) => reader.usageByDay(ctx, range, id)),
    );
    return group(
      lists.flat(),
      (row) => row.day,
      (row) => ({ day: row.day }),
    ).sort((a, b) => a.day.localeCompare(b.day));
  },
});

export const recentCalls = query({
  args: { ...scope, limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 40;
    const prefix = `${args.visitor}/`;
    const lists = await Promise.all(
      targets(args).map((id) =>
        reader.recentCalls(ctx, { customer: id, limit }),
      ),
    );
    return lists
      .flat()
      .sort((a, b) => b.at - a.at)
      .slice(0, limit)
      .map((row) => ({ ...row, customer: row.customer.slice(prefix.length) }));
  },
});

export const budgets = query({
  args: scope,
  handler: async (ctx, args) =>
    await Promise.all(
      args.customers.map(async (name) => ({
        ...(await reader.budget(ctx, scoped(args.visitor, name))),
        customer: name,
      })),
    ),
});

export const runCost = query({
  args: { runId: v.string() },
  handler: async (ctx, args) => await reader.runCost(ctx, args.runId),
});
