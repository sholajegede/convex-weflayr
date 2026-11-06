import type { GenericActionCtx, GenericDataModel } from "convex/server";
import type { ComponentApi } from "../component/_generated/component.js";
import {
  type RevenueRow,
  type RiskStatus,
  WeflayrApi,
  monthRange,
} from "./api.js";

export * from "./api.js";

export const GATEWAY_URL = "https://gateway.weflayr.com/v1";
export const METADATA_HEADER = "x-weflayr-metadata";

export type Prices = Record<
  string,
  { inputPerMillion: number; outputPerMillion: number }
>;

type Auth = {
  auth: { getUserIdentity(): Promise<{ subject: string } | null> };
};

export type WeflayrOptions = {
  /** Maps each call name to the feature it belongs to. A call that is not listed is filed under `defaultFeature`. */
  features?: Record<string, string>;
  defaultFeature?: string;
  /**
   * The model or routing strategy each call uses, by call name. Use `strategy(id, version)` so the
   * model is picked in Weflayr, not in your code. Read it with `weflayr.modelFor(call)`.
   */
  models?: Record<string, string>;
  /** The model or strategy for calls not listed in `models`. */
  defaultModel?: string;
  baseURL?: string;
  /** The gateway key. Defaults to the WEFLAYR_API_KEY environment variable. */
  apiKey?: string;
  /** The key for Weflayr's management API. Defaults to WEFLAYR_MANAGEMENT_KEY, then WEFLAYR_API_KEY. */
  managementKey?: string;
  managementURL?: string;
  /**
   * Which customers may go through the gateway: "*", a comma separated string, a list, or a function.
   * Defaults to the WEFLAYR_CUSTOMERS environment variable. When nothing is set, no customer is allowed.
   */
  allow?: "*" | string | string[] | ((customer: string) => boolean);
  /**
   * Who a call is for, from the function's context. Defaults to the signed-in user's subject.
   * Return an organization or workspace id for team apps.
   */
  customer?: (ctx: Auth) => Promise<string | null | undefined> | string | null | undefined;
  /** What `callMeta` does when no customer resolves. Defaults to "throw". */
  missingCustomer?: "throw" | "warn";
  /** Dollars per million tokens by model id, used to estimate cost between syncs with Weflayr. */
  prices?: Prices;
  /** Margin statuses that make `assertWithinBudget` throw, for example ["unprofitable"]. Read from the last `sync`. */
  stopOnMargin?: RiskStatus[];
  /** How long a stored call is added on top of Weflayr's synced cost, to cover the time Weflayr takes to record it. Defaults to 5 minutes. */
  settleMs?: number;
};

export type CallMeta = {
  /** The customer this call is for: a workspace, an organization or a user id. */
  customer: string;
  /** The name of the call, for example "draft-post". A benchmark in Weflayr is set up per call name. */
  call: string;
  plan?: string;
  /** Weflayr's feature run id, to group the calls of one job: 32 lowercase hex characters from `newRunId()`. */
  runId?: string;
  tags?: Record<string, string>;
};

export type TrackMeta = CallMeta & {
  /** The model or strategy the call asks for. The model that answered is read from the result when it is there. */
  model: string;
  costUsd?: number;
  status?: "ok" | "fallback";
};

export type Extracted = {
  inputTokens: number;
  outputTokens: number;
  costUsd?: number;
  /** The model that answered, when different from the one asked for. */
  model?: string;
  /** The gateway's weflayr_warnings. */
  warnings?: unknown[];
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

export class WeflayrMarginError extends Error {
  constructor(
    readonly customer: string,
    readonly riskStatus: string,
  ) {
    super(
      `Customer "${customer}" is ${riskStatus.replace("_", " ")} on AI margin this month.`,
    );
    this.name = "WeflayrMarginError";
  }
}

const RUN_ID = /^[0-9a-f]{32}$/;

/** The model id for a Weflayr routing strategy, optionally pinned to one version. */
export function strategy(id: string, version?: number | string): string {
  return version === undefined ? `strategy/${id}` : `strategy/${id}:${version}`;
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

/** A new Weflayr feature run id: 32 lowercase hex characters. */
export function newRunId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function asciiJson(value: unknown): string {
  return JSON.stringify(value).replace(
    /[\u007f-￿]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

function readResult(result: unknown): Extracted {
  const value = result as {
    usage?: Record<string, unknown>;
    response?: { modelId?: unknown; body?: { weflayr_warnings?: unknown } };
  } | null;
  const usage = value?.usage ?? {};
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const number = usage[key];
      if (typeof number === "number" && Number.isFinite(number)) return number;
    }
    return 0;
  };
  const model = value?.response?.modelId;
  const warnings = value?.response?.body?.weflayr_warnings;
  return {
    inputTokens: pick("inputTokens", "promptTokens"),
    outputTokens: pick("outputTokens", "completionTokens"),
    ...(typeof model === "string" && model !== "" ? { model } : {}),
    ...(Array.isArray(warnings) && warnings.length ? { warnings } : {}),
  };
}

function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 500);
}

export class Weflayr {
  private apiClient?: WeflayrApi;

  constructor(
    public component: ComponentApi,
    private options: WeflayrOptions = {},
  ) {}

  get baseURL(): string {
    return this.options.baseURL ?? GATEWAY_URL;
  }

  /** Weflayr's management API: cost, margin, revenue and customer tags. Call it from actions. */
  get api(): WeflayrApi {
    this.apiClient ??= new WeflayrApi({
      apiKey: this.options.managementKey,
      baseURL: this.options.managementURL,
    });
    return this.apiClient;
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

  /** The model or strategy configured for a call in `models`, or `defaultModel`. */
  modelFor(call: string): string {
    const model = this.options.models?.[call] ?? this.options.defaultModel;
    if (!model) {
      throw new Error(`No model or strategy is set for the call "${call}". Add it to \`models\` or set \`defaultModel\`.`);
    }
    return model;
  }

  /** The customer of this function call: your `customer` option, or the signed-in user's subject. */
  async customerOf(ctx: Auth): Promise<string | undefined> {
    const customer = this.options.customer
      ? await this.options.customer(ctx)
      : (await ctx.auth.getUserIdentity())?.subject;
    return customer ?? undefined;
  }

  /**
   * The details of one call, with the customer read from the function's context. Weflayr's routing
   * overrides by customer only work when every call carries one, so a call with no customer throws
   * (or warns, with `missingCustomer: "warn"`).
   */
  async callMeta(
    ctx: Auth,
    meta: Omit<CallMeta, "customer">,
  ): Promise<CallMeta & { model: string }> {
    const customer = await this.customerOf(ctx);
    if (!customer) {
      const message = `No customer for the call "${meta.call}". Weflayr can't route it or price it per customer.`;
      if (this.options.missingCustomer === "warn") console.warn(message);
      else throw new Error(message);
    }
    return { ...meta, customer: customer ?? "unknown", model: this.modelFor(meta.call) };
  }

  /** The value of the x-weflayr-metadata header: feature, call, customer and run. Written as ASCII so any name is a valid header. */
  metadata(meta: CallMeta): string {
    if (meta.runId !== undefined && !RUN_ID.test(meta.runId)) {
      throw new Error("A Weflayr run id is 32 lowercase hex characters. Make one with newRunId().");
    }
    const tags: Record<string, string> = { ...meta.tags };
    if (meta.plan) tags.plan = meta.plan;
    return asciiJson({
      feature_name: this.featureOf(meta.call),
      call_name: meta.call,
      customer_name: meta.customer,
      ...(meta.runId ? { feature_run_uuid: meta.runId } : {}),
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
      /** The model that answered, when it differs from `model`. */
      answeredBy?: string;
      warnings?: unknown[];
    },
  ) {
    const model = entry.answeredBy ?? entry.model;
    const estimated = this.estimateCost(
      model,
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
      model,
      ...(model !== entry.model ? { requestedModel: entry.model } : {}),
      status: entry.status,
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      costUsd,
      costSource,
      latencyMs: entry.latencyMs,
      runId: entry.runId,
      plan: entry.plan,
      error: entry.error,
      ...(entry.warnings?.length ? { warnings: JSON.stringify(entry.warnings).slice(0, 2000) } : {}),
    });
  }

  /**
   * Runs a model call, times it and stores customer, call, the model that answered, tokens, cost and
   * status. A problem while storing never fails the call, and a failed call is stored as an error and
   * thrown again.
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
    const read = readResult(result);
    const extracted = options.extract ? { ...read, ...options.extract(result) } : read;
    if (extracted.warnings?.length) {
      console.warn(
        `The Weflayr gateway changed the request of "${meta.call}":`,
        JSON.stringify(extracted.warnings),
      );
    }
    await this.safeRecord(ctx, {
      ...meta,
      inputTokens: extracted.inputTokens,
      outputTokens: extracted.outputTokens,
      costUsd: meta.costUsd ?? extracted.costUsd,
      answeredBy: extracted.model,
      warnings: extracted.warnings,
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

  /**
   * Reads every customer's real cost and margin for the month from Weflayr and stores it, so budgets
   * use Weflayr's figures and `customerStatus` answers instantly. Run it from an action, on a cron.
   */
  async sync(ctx: RunMutation, options: { month?: string } = {}) {
    const month = options.month ?? currentMonth();
    const { from, to } = monthRange(month);
    const rows = new Map<
      string,
      { customer: string; costUsd: number; revenue: number | null; marginPct: number | null; riskStatus: string | null }
    >();
    let cursor: string | undefined;
    do {
      const page = await this.api.getCosts({ date_from: from, date_to: to, aggregate: "all", group_by: "customer", limit: 1000, cursor });
      for (const row of page.rows) {
        if (!row.customer) continue;
        rows.set(row.customer, { customer: row.customer, costUsd: row.cost ?? 0, revenue: null, marginPct: null, riskStatus: null });
      }
      cursor = page.has_more && page.next_cursor ? page.next_cursor : undefined;
    } while (cursor);

    let margin = true;
    cursor = undefined;
    do {
      let page;
      try {
        page = await this.api.getMargin({ date_from: from, date_to: to, aggregate: "all", group_by: "customer", limit: 1000, cursor });
      } catch (error) {
        // An internal project has no margin. Keep the costs.
        if ((error as { status?: number }).status === 400) {
          margin = false;
          break;
        }
        throw error;
      }
      for (const row of page.rows) {
        if (!row.customer) continue;
        rows.set(row.customer, {
          customer: row.customer,
          costUsd: row.cost ?? rows.get(row.customer)?.costUsd ?? 0,
          revenue: row.revenue ?? null,
          marginPct: row.margin_pct ?? null,
          riskStatus: row.risk_status ?? null,
        });
      }
      cursor = page.has_more && page.next_cursor ? page.next_cursor : undefined;
    } while (cursor);

    const all = [...rows.values()];
    const syncedAt = Date.now();
    for (let i = 0; i < all.length; i += 200) {
      await ctx.runMutation(this.component.lib.saveSynced, { month, syncedAt, rows: all.slice(i, i + 200) });
    }
    return { month, customers: all.length, margin };
  }

  /** One customer's real cost and margin status from the last `sync`, or null before the first one. */
  async customerStatus(ctx: RunQuery, customer: string, month: string = currentMonth()) {
    return await ctx.runQuery(this.component.lib.customerStatus, { customer, month });
  }

  /**
   * Books revenue per customer and month in Weflayr, so it can work out margin. Send `revenue_id`
   * (your invoice id) so a retried webhook overwrites the row instead of adding it twice. Retries
   * failed requests up to three times. Skip this if Weflayr already syncs your Stripe account.
   */
  async sendRevenue(rows: RevenueRow[]) {
    return await this.withRetry(() => this.api.setRevenue(rows, { upsert: true }));
  }

  /** Sets tags such as the plan on customers in Weflayr, for dashboards and margin views split by plan. */
  async tagCustomers(customers: Record<string, Record<string, string | null>>) {
    return await this.withRetry(() =>
      this.api.setCustomerTags(
        Object.entries(customers).map(([customer_name, tags]) => ({ customer_name, tags })),
        { upsert: true },
      ),
    );
  }

  private async withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await fn();
      } catch (error) {
        const status = (error as { status?: number }).status;
        const retryable = status === undefined || status === 429 || status >= 500;
        if (!retryable || attempt >= attempts) throw error;
        await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** (attempt - 1)));
      }
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

  /**
   * The customer's budget and spend for the month. After a `sync`, spend is Weflayr's real cost plus
   * calls stored since shortly before the sync. Before the first sync, it is the stored calls' cost.
   */
  async budget(
    ctx: RunQuery,
    customer: string,
    month: string = currentMonth(),
  ) {
    return await ctx.runQuery(this.component.lib.budgetStatus, {
      customer,
      month,
      settleMs: this.options.settleMs,
    });
  }

  /**
   * Throws a WeflayrBudgetError when the customer has used its monthly budget, and a
   * WeflayrMarginError when its margin status is in `stopOnMargin`. A customer without a budget passes.
   */
  async assertWithinBudget(ctx: RunQuery, customer: string) {
    const status = await this.budget(ctx, customer);
    if (!status.allowed && status.limitUsd !== null) {
      throw new WeflayrBudgetError(customer, status.limitUsd, status.spentUsd);
    }
    if (status.riskStatus && this.options.stopOnMargin?.includes(status.riskStatus)) {
      throw new WeflayrMarginError(customer, status.riskStatus);
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
