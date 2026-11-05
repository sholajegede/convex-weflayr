import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { ComponentApi } from "../component/_generated/component.js";
import {
  Weflayr,
  WeflayrBudgetError,
  currentMonth,
  lastDays,
} from "./index.js";

const component = {
  lib: {
    record: "record",
    budgetStatus: "budgetStatus",
    setBudget: "setBudget",
  },
} as unknown as ComponentApi;

function fakeCtx(budget?: {
  allowed: boolean;
  limitUsd: number | null;
  spentUsd: number;
}) {
  const mutations: Array<Record<string, unknown>> = [];
  return {
    mutations,
    runMutation: vi.fn(async (_ref: unknown, args: Record<string, unknown>) => {
      mutations.push(args);
      return "id";
    }),
    runQuery: vi.fn(async () => ({
      customer: "acme",
      month: "2026-11",
      remainingUsd: null,
      ...budget,
    })),
  } as any;
}

const features = { "draft-post": "post-drafting", "scan-moments": "idea-scan" };

beforeEach(() => {
  vi.stubEnv("WEFLAYR_API_KEY", "key");
  vi.stubEnv("WEFLAYR_CUSTOMERS", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("metadata", () => {
  test("names the feature, call and customer", () => {
    const weflayr = new Weflayr(component, { features });
    expect(
      JSON.parse(weflayr.metadata({ customer: "acme", call: "draft-post" })),
    ).toEqual({
      feature_name: "post-drafting",
      call_name: "draft-post",
      customer_name: "acme",
    });
  });

  test("an unknown call is filed under the default feature", () => {
    const weflayr = new Weflayr(component, {
      features,
      defaultFeature: "misc",
    });
    expect(
      JSON.parse(weflayr.metadata({ customer: "a", call: "mystery" }))
        .feature_name,
    ).toBe("misc");
    expect(
      JSON.parse(
        new Weflayr(component).metadata({ customer: "a", call: "mystery" }),
      ).feature_name,
    ).toBe("other");
  });

  test("plan, run id and tags are sent as tags", () => {
    const weflayr = new Weflayr(component, { features });
    const parsed = JSON.parse(
      weflayr.metadata({
        customer: "a",
        call: "draft-post",
        plan: "team",
        runId: "r1",
        tags: { env: "prod" },
      }),
    );
    expect(parsed.tags).toEqual({ env: "prod", plan: "team", run_id: "r1" });
  });

  test("a customer name with non ASCII characters is a valid header value", () => {
    const weflayr = new Weflayr(component, { features });
    const header = weflayr.metadata({
      customer: "Café Müller 🚀",
      call: "draft-post",
    });
    expect(/^[\x20-\x7e]*$/.test(header)).toBe(true);
    expect(JSON.parse(header).customer_name).toBe("Café Müller 🚀");
    expect(
      weflayr.headers({ customer: "a", call: "draft-post" }),
    ).toHaveProperty("x-weflayr-metadata");
  });
});

describe("enabled", () => {
  test("needs a key", () => {
    vi.stubEnv("WEFLAYR_API_KEY", "");
    expect(new Weflayr(component, { allow: "*" }).enabled("acme")).toBe(false);
    expect(() => new Weflayr(component, { allow: "*" }).connection()).toThrow(
      /WEFLAYR_API_KEY/,
    );
  });

  test("nobody is allowed until a list is set", () => {
    expect(new Weflayr(component).enabled("acme")).toBe(false);
  });

  test("a list, a string, a wildcard, a function and the environment", () => {
    expect(new Weflayr(component, { allow: ["acme"] }).enabled("acme")).toBe(
      true,
    );
    expect(new Weflayr(component, { allow: ["acme"] }).enabled("other")).toBe(
      false,
    );
    expect(new Weflayr(component, { allow: "a, b" }).enabled("b")).toBe(true);
    expect(new Weflayr(component, { allow: "*" }).enabled("anyone")).toBe(true);
    expect(
      new Weflayr(component, {
        allow: (customer) => customer.startsWith("pro-"),
      }).enabled("pro-1"),
    ).toBe(true);
    vi.stubEnv("WEFLAYR_CUSTOMERS", "env-customer");
    expect(new Weflayr(component).enabled("env-customer")).toBe(true);
  });

  test("connection returns the gateway address and key", () => {
    expect(new Weflayr(component, { allow: "*" }).connection()).toEqual({
      baseURL: "https://gateway.weflayr.com/v1",
      apiKey: "key",
    });
  });
});

describe("cost", () => {
  const prices = {
    "claude-opus-5-5": { inputPerMillion: 5, outputPerMillion: 25 },
  };

  test("is estimated from a price table, with or without a provider prefix", () => {
    const weflayr = new Weflayr(component, { prices });
    expect(
      weflayr.estimateCost("claude-opus-5-5", 1_000_000, 100_000),
    ).toBeCloseTo(7.5);
    expect(
      weflayr.estimateCost("anthropic/claude-opus-5-5", 1_000_000, 0),
    ).toBeCloseTo(5);
    expect(weflayr.estimateCost("unknown", 10, 10)).toBeUndefined();
    expect(
      new Weflayr(component).estimateCost("claude-opus-5-5", 1, 1),
    ).toBeUndefined();
  });

  test("a reported cost wins over an estimate", async () => {
    const ctx = fakeCtx();
    const weflayr = new Weflayr(component, { features, prices });
    await weflayr.record(ctx, {
      customer: "a",
      call: "draft-post",
      model: "claude-opus-5-5",
      inputTokens: 10,
      outputTokens: 10,
      latencyMs: 1,
      status: "ok",
      costUsd: 0.5,
    });
    expect(ctx.mutations[0]).toMatchObject({
      costUsd: 0.5,
      costSource: "reported",
      feature: "post-drafting",
    });
  });

  test("without prices or a reported cost the source is none", async () => {
    const ctx = fakeCtx();
    await new Weflayr(component).record(ctx, {
      customer: "a",
      call: "c",
      model: "m",
      inputTokens: 1,
      outputTokens: 1,
      latencyMs: 1,
      status: "ok",
    });
    expect(ctx.mutations[0]).toMatchObject({ costUsd: 0, costSource: "none" });
  });
});

describe("track", () => {
  const meta = {
    customer: "acme",
    call: "draft-post",
    model: "claude-opus-5-5",
  };

  test("stores the usage from an AI SDK result", async () => {
    const ctx = fakeCtx();
    const weflayr = new Weflayr(component, {
      features,
      prices: {
        "claude-opus-5-5": { inputPerMillion: 5, outputPerMillion: 25 },
      },
    });
    const result = await weflayr.track(ctx, meta, async () => ({
      text: "hi",
      usage: { inputTokens: 200, outputTokens: 100 },
    }));
    expect(result.text).toBe("hi");
    expect(ctx.mutations[0]).toMatchObject({
      customer: "acme",
      status: "ok",
      inputTokens: 200,
      outputTokens: 100,
      costSource: "estimated",
    });
  });

  test("reads older usage field names", async () => {
    const ctx = fakeCtx();
    await new Weflayr(component).track(ctx, meta, async () => ({
      usage: { promptTokens: 7, completionTokens: 3 },
    }));
    expect(ctx.mutations[0]).toMatchObject({ inputTokens: 7, outputTokens: 3 });
  });

  test("a custom extractor can report cost", async () => {
    const ctx = fakeCtx();
    await new Weflayr(component).track(ctx, meta, async () => ({ n: 1 }), {
      extract: () => ({ inputTokens: 1, outputTokens: 2, costUsd: 0.25 }),
    });
    expect(ctx.mutations[0]).toMatchObject({
      costUsd: 0.25,
      costSource: "reported",
    });
  });

  test("a failed call is stored as an error and thrown again", async () => {
    const ctx = fakeCtx();
    await expect(
      new Weflayr(component).track(ctx, meta, async () => {
        throw new Error("402 no credits");
      }),
    ).rejects.toThrow("402 no credits");
    expect(ctx.mutations[0]).toMatchObject({
      status: "error",
      error: "402 no credits",
      inputTokens: 0,
    });
  });

  test("a problem while storing never fails the call", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const ctx = fakeCtx();
    ctx.runMutation.mockRejectedValue(new Error("database down"));
    const result = await new Weflayr(component).track(
      ctx,
      meta,
      async () => "answer",
    );
    expect(result).toBe("answer");
    expect(warn).toHaveBeenCalled();
  });
});

describe("withFallback", () => {
  const meta = {
    customer: "acme",
    call: "draft-post",
    model: "claude-opus-5-5",
  };

  test("a customer who is not allowed runs direct and is not stored", async () => {
    const ctx = fakeCtx();
    const gateway = vi.fn(async () => "gateway");
    const result = await new Weflayr(component, { allow: [] }).withFallback(
      ctx,
      meta,
      { gateway, direct: async () => "direct" },
    );
    expect(result).toBe("direct");
    expect(gateway).not.toHaveBeenCalled();
    expect(ctx.mutations).toHaveLength(0);
  });

  test("an allowed customer goes through the gateway", async () => {
    const ctx = fakeCtx();
    const result = await new Weflayr(component, { allow: "*" }).withFallback(
      ctx,
      meta,
      {
        gateway: async () => ({ usage: { inputTokens: 1, outputTokens: 1 } }),
        direct: async () => {
          throw new Error("should not run");
        },
      },
    );
    expect(result).toBeTruthy();
    expect(ctx.mutations).toHaveLength(1);
    expect(ctx.mutations[0]).toMatchObject({ status: "ok" });
  });

  test("a gateway failure stores an error, then runs direct and stores a fallback", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const ctx = fakeCtx();
    const result = await new Weflayr(component, { allow: "*" }).withFallback(
      ctx,
      meta,
      {
        gateway: async () => {
          throw new Error("gateway down");
        },
        direct: async () => ({ usage: { inputTokens: 5, outputTokens: 5 } }),
      },
    );
    expect(result).toBeTruthy();
    expect(
      ctx.mutations.map((row: Record<string, unknown>) => row.status),
    ).toEqual(["error", "fallback"]);
  });

  test("when direct also fails the error is thrown", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const ctx = fakeCtx();
    await expect(
      new Weflayr(component, { allow: "*" }).withFallback(ctx, meta, {
        gateway: async () => {
          throw new Error("a");
        },
        direct: async () => {
          throw new Error("b");
        },
      }),
    ).rejects.toThrow("b");
  });
});

describe("budget", () => {
  test("passes with no budget or room left, throws when the budget is used", async () => {
    const weflayr = new Weflayr(component);
    await expect(
      weflayr.assertWithinBudget(
        fakeCtx({ allowed: true, limitUsd: null, spentUsd: 3 }),
        "acme",
      ),
    ).resolves.toBeTruthy();
    await expect(
      weflayr.assertWithinBudget(
        fakeCtx({ allowed: true, limitUsd: 5, spentUsd: 3 }),
        "acme",
      ),
    ).resolves.toBeTruthy();
    const error = await weflayr
      .assertWithinBudget(
        fakeCtx({ allowed: false, limitUsd: 5, spentUsd: 5.2 }),
        "acme",
      )
      .catch((e) => e);
    expect(error).toBeInstanceOf(WeflayrBudgetError);
    expect(error.message).toMatch(/\$5\.2000 of its \$5\.00/);
  });
});

describe("dates", () => {
  test("month and range helpers use UTC", () => {
    const now = Date.UTC(2026, 10, 1, 23, 30);
    expect(currentMonth(now)).toBe("2026-11");
    expect(lastDays(7, now)).toEqual({ from: "2026-10-26", to: "2026-11-01" });
    expect(lastDays(1, now)).toEqual({ from: "2026-11-01", to: "2026-11-01" });
  });
});
