import type { GenericActionCtx, GenericDataModel } from "convex/server";
import type { ComponentApi } from "../component/_generated/component.js";

export const GATEWAY_URL = "https://gateway.weflayr.com/v1";
export const METADATA_HEADER = "x-weflayr-metadata";

export type Prices = Record<
  string,
  { inputPerMillion: number; outputPerMillion: number }
>;

export type WeflayrOptions = {
  /** Maps each call name to the feature it belongs to. A call that is not listed is filed under `defaultFeature`. */
  features?: Record<string, string>;
  defaultFeature?: string;
  baseURL?: string;
  /** Defaults to the WEFLAYR_API_KEY environment variable. */
  apiKey?: string;
  /**
   * Which customers may go through the gateway: "*", a comma separated string, a list, or a function.
   * Defaults to the WEFLAYR_CUSTOMERS environment variable. When nothing is set, no customer is allowed.
   */
  allow?: "*" | string | string[] | ((customer: string) => boolean);
  /** Dollars per million tokens by model id, used to estimate cost when the call does not report one. */
  prices?: Prices;
};

export type CallMeta = {
  /** The customer this call is for: a workspace, an organization or a user id. */
  customer: string;
  /** The name of the call, for example "draft-post". A benchmark in Weflayr is set up per call name. */
  call: string;
  plan?: string;
  /** Groups the calls of one job. Sent to Weflayr as the run_id tag and stored with each call. */
  runId?: string;
  tags?: Record<string, string>;
};

export type TrackMeta = CallMeta & {
  model: string;
  costUsd?: number;
  status?: "ok" | "fallback";
};

export type Extracted = {
  inputTokens: number;
  outputTokens: number;
  costUsd?: number;
};

export type TrackOptions<T> = {
  extract?: (result: T) => Extracted;
};

export type Range = { from: string; to: string };

type RunMutation = {
  runMutation: GenericActionCtx<GenericDataModel>["runMutation"];
};
type RunQuery = { runQuery: GenericActionCtx<GenericDataModel>["runQuery"] };

/** Dollars with up to six decimals, so a budget of $0.00002 does not show as $0.00. */
function dollars(value: number): string {
  return `$${Number(value.toFixed(6))}`;
}

export class WeflayrBudgetError extends Error {
  constructor(
    readonly customer: string,
    readonly limitUsd: number,
    readonly spentUsd: number,
  ) {
    super(
      `Customer "${customer}" has used ${dollars(spentUsd)} of its ${dollars(limitUsd)} monthly AI budget.`,
    );
    this.name = "WeflayrBudgetError";
  }
}

export function currentMonth(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 7);
}

export function lastDays(days: number, now: number = Date.now()): Range {
  const to = new Date(now);
  const from = new Date(now - (Math.max(days, 1) - 1) * 86_400_000);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export function newRunId(): string {
  return crypto.randomUUID();
}

function asciiJson(value: unknown): string {
  return JSON.stringify(value).replace(
    /[\u007f-￿]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

function readUsage(result: unknown): Extracted {
  const usage =
    (result as { usage?: Record<string, unknown> } | null)?.usage ?? {};
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const value = usage[key];
      if (typeof value === "number" && Number.isFinite(value)) return value;
    }
    return 0;
  };
  return {
    inputTokens: pick("inputTokens", "promptTokens"),
    outputTokens: pick("outputTokens", "completionTokens"),
  };
}

function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 500);
}

export class Weflayr {
  constructor(
    public component: ComponentApi,
    private options: WeflayrOptions = {},
  ) {}

  get baseURL(): string {
    return this.options.baseURL ?? GATEWAY_URL;
  }

  private apiKey(): string | undefined {
    return this.options.apiKey ?? process.env.WEFLAYR_API_KEY ?? undefined;
  }

  /** The base URL and key for any OpenAI compatible client. Throws when no key is set. */
  connection(): { baseURL: string; apiKey: string } {
    const apiKey = this.apiKey();
    if (!apiKey) throw new Error("WEFLAYR_API_KEY is not set.");
    return { baseURL: this.baseURL, apiKey };
  }

  /** True when a key is set and this customer is allowed through the gateway. */
  enabled(customer: string): boolean {
    if (!this.apiKey()) return false;
    const allow = this.options.allow ?? process.env.WEFLAYR_CUSTOMERS ?? "";
    if (typeof allow === "function") return allow(customer);
    const ids = Array.isArray(allow) ? allow : allow.split(",");
    const list = ids.map((id) => id.trim()).filter(Boolean);
    return list.includes("*") || list.includes(customer);
  }

  featureOf(call: string): string {
    return (
      this.options.features?.[call] ?? this.options.defaultFeature ?? "other"
    );
  }

  /** The value of the x-weflayr-metadata header: feature, call and customer. Written as ASCII so any name is a valid header. */
  metadata(meta: CallMeta): string {
    const tags: Record<string, string> = { ...meta.tags };
    if (meta.plan) tags.plan = meta.plan;
    if (meta.runId) tags.run_id = meta.runId;
    return asciiJson({
      feature_name: this.featureOf(meta.call),
      call_name: meta.call,
      customer_name: meta.customer,
      ...(Object.keys(tags).length ? { tags } : {}),
    });
  }

  headers(meta: CallMeta): Record<string, string> {
    return { [METADATA_HEADER]: this.metadata(meta) };
  }

  estimateCost(
    model: string,
    inputTokens: number,
    outputTokens: number,
  ): number | undefined {
    const prices = this.options.prices;
    if (!prices) return undefined;
    const price =
      prices[model] ?? prices[model.slice(model.lastIndexOf("/") + 1)];
    if (!price) return undefined;
    return (
      (inputTokens * price.inputPerMillion +
        outputTokens * price.outputPerMillion) /
      1_000_000
    );
  }

  /** Stores one call. Use `track` to time a call and store it in one step. */
  async record(
    ctx: RunMutation,
    entry: Omit<TrackMeta, "status"> & {
      inputTokens: number;
      outputTokens: number;
      latencyMs: number;
      status: "ok" | "error" | "fallback";
      error?: string;
    },
  ) {
    const estimated = this.estimateCost(
      entry.model,
      entry.inputTokens,
      entry.outputTokens,
    );
    const costUsd = entry.costUsd ?? estimated ?? 0;
    const costSource =
      entry.costUsd !== undefined
        ? "reported"
        : estimated !== undefined
          ? "estimated"
          : "none";
    return await ctx.runMutation(this.component.lib.record, {
      customer: entry.customer,
      call: entry.call,
      feature: this.featureOf(entry.call),
      model: entry.model,
      status: entry.status,
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      costUsd,
      costSource,
      latencyMs: entry.latencyMs,
      runId: entry.runId,
      plan: entry.plan,
      error: entry.error,
    });
  }

  /**
   * Runs a model call, times it and stores customer, call, model, tokens, cost and status.
   * A problem while storing never fails the call, and a failed call is stored as an error and thrown again.
   */
  async track<T>(
    ctx: RunMutation,
    meta: TrackMeta,
    fn: () => Promise<T>,
    options: TrackOptions<T> = {},
  ): Promise<T> {
    const started = Date.now();
    let result: T;
    try {
      result = await fn();
    } catch (error) {
      await this.safeRecord(ctx, {
        ...meta,
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: Date.now() - started,
        status: "error",
        error: describeError(error),
      });
      throw error;
    }
    const extracted = options.extract
      ? options.extract(result)
      : readUsage(result);
    await this.safeRecord(ctx, {
      ...meta,
      inputTokens: extracted.inputTokens,
      outputTokens: extracted.outputTokens,
      costUsd: meta.costUsd ?? extracted.costUsd,
      latencyMs: Date.now() - started,
      status: meta.status ?? "ok",
    });
    return result;
  }

  /**
   * Tries the gateway and, if it fails, runs the same call directly so a customer's request still completes.
   * The failed attempt is stored as an error and the direct run as a fallback.
   * A customer who is not allowed through the gateway runs directly and is not stored.
   */
  async withFallback<T>(
    ctx: RunMutation,
    meta: TrackMeta,
    calls: { gateway: () => Promise<T>; direct: () => Promise<T> },
    options: TrackOptions<T> = {},
  ): Promise<T> {
    if (!this.enabled(meta.customer)) return await calls.direct();
    try {
      return await this.track(ctx, meta, calls.gateway, options);
    } catch (error) {
      console.warn(
        "Weflayr gateway call failed, running direct:",
        describeError(error),
      );
      return await this.track(
        ctx,
        { ...meta, status: "fallback" },
        calls.direct,
        options,
      );
    }
  }

  private async safeRecord(
    ctx: RunMutation,
    entry: Parameters<Weflayr["record"]>[1],
  ) {
    try {
      await this.record(ctx, entry);
    } catch (error) {
      console.warn(
        "convex-weflayr could not store a call:",
        describeError(error),
      );
    }
  }

  async setBudget(ctx: RunMutation, customer: string, monthlyUsd: number) {
    await ctx.runMutation(this.component.lib.setBudget, {
      customer,
      monthlyUsd,
    });
  }

  async clearBudget(ctx: RunMutation, customer: string) {
    await ctx.runMutation(this.component.lib.clearBudget, { customer });
  }

  async budget(
    ctx: RunQuery,
    customer: string,
    month: string = currentMonth(),
  ) {
    return await ctx.runQuery(this.component.lib.budgetStatus, {
      customer,
      month,
    });
  }

  /** Throws a WeflayrBudgetError when the customer has used its monthly budget. A customer without a budget always passes. */
  async assertWithinBudget(ctx: RunQuery, customer: string) {
    const status = await this.budget(ctx, customer);
    if (!status.allowed && status.limitUsd !== null) {
      throw new WeflayrBudgetError(customer, status.limitUsd, status.spentUsd);
    }
    return status;
  }

  async usageByCustomer(ctx: RunQuery, range: Range) {
    return await ctx.runQuery(this.component.lib.usageByCustomer, range);
  }

  async usageByCall(ctx: RunQuery, range: Range, customer?: string) {
    return await ctx.runQuery(this.component.lib.usageByCall, {
      ...range,
      customer,
    });
  }

  async usageByFeature(ctx: RunQuery, range: Range, customer?: string) {
    return await ctx.runQuery(this.component.lib.usageByFeature, {
      ...range,
      customer,
    });
  }

  async usageByDay(ctx: RunQuery, range: Range, customer?: string) {
    return await ctx.runQuery(this.component.lib.usageByDay, {
      ...range,
      customer,
    });
  }

  async runCost(ctx: RunQuery, runId: string) {
    return await ctx.runQuery(this.component.lib.runCost, { runId });
  }

  async recentCalls(
    ctx: RunQuery,
    options: { customer?: string; limit?: number } = {},
  ) {
    return await ctx.runQuery(this.component.lib.recentCalls, options);
  }

  /** Deletes stored calls older than `before` (a timestamp in ms). Daily totals are kept. Returns whether more remain. */
  async purge(ctx: RunMutation, before: number, limit?: number) {
    return await ctx.runMutation(this.component.lib.purge, { before, limit });
  }
}
