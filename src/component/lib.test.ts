/// <reference types="vite/client" />
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api.js";
import { initConvexTest } from "./setup.test.js";

const DAY = Date.UTC(2026, 10, 1, 12, 0, 0);

const base = {
  customer: "acme",
  call: "draft-post",
  feature: "post-drafting",
  model: "claude-opus-5-5",
  status: "ok" as const,
  inputTokens: 1000,
  outputTokens: 500,
  costUsd: 0.05,
  costSource: "reported" as const,
  latencyMs: 2000,
};

describe("record and rollups", () => {
  test("a call is stored and added to the daily totals", async () => {
    const t = initConvexTest();
    await t.mutation(api.lib.record, { ...base, at: DAY });
    await t.mutation(api.lib.record, {
      ...base,
      at: DAY + 1000,
      costUsd: 0.03,
      latencyMs: 1000,
    });
    const byCustomer = await t.query(api.lib.usageByCustomer, {
      from: "2026-11-01",
      to: "2026-11-01",
    });
    expect(byCustomer).toHaveLength(1);
    expect(byCustomer[0]).toMatchObject({
      customer: "acme",
      calls: 2,
      inputTokens: 2000,
      outputTokens: 1000,
    });
    expect(byCustomer[0].costUsd).toBeCloseTo(0.08);
    expect(byCustomer[0].averageLatencyMs).toBe(1500);
  });

  test("errors and fallbacks are counted", async () => {
    const t = initConvexTest();
    await t.mutation(api.lib.record, { ...base, status: "error", at: DAY });
    await t.mutation(api.lib.record, { ...base, status: "fallback", at: DAY });
    const [row] = await t.query(api.lib.usageByCustomer, {
      from: "2026-11-01",
      to: "2026-11-01",
    });
    expect(row).toMatchObject({ calls: 2, errors: 1, fallbacks: 1 });
  });

  test("customers are ranked by cost and kept apart", async () => {
    const t = initConvexTest();
    await t.mutation(api.lib.record, {
      ...base,
      customer: "small",
      costUsd: 0.01,
      at: DAY,
    });
    await t.mutation(api.lib.record, {
      ...base,
      customer: "big",
      costUsd: 0.9,
      at: DAY,
    });
    const rows = await t.query(api.lib.usageByCustomer, {
      from: "2026-11-01",
      to: "2026-11-30",
    });
    expect(rows.map((row) => row.customer)).toEqual(["big", "small"]);
  });

  test("usage by call, feature and day", async () => {
    const t = initConvexTest();
    await t.mutation(api.lib.record, { ...base, at: DAY });
    await t.mutation(api.lib.record, {
      ...base,
      call: "verify-post",
      costUsd: 0.01,
      at: DAY,
    });
    await t.mutation(api.lib.record, {
      ...base,
      call: "scan-moments",
      feature: "idea-scan",
      costUsd: 0.02,
      at: DAY + 86_400_000,
    });
    const range = { from: "2026-11-01", to: "2026-11-02" };
    const byCall = await t.query(api.lib.usageByCall, range);
    expect(byCall.map((row) => row.call)).toEqual([
      "draft-post",
      "scan-moments",
      "verify-post",
    ]);
    const byFeature = await t.query(api.lib.usageByFeature, range);
    expect(
      byFeature.find((row) => row.feature === "post-drafting")?.calls,
    ).toBe(2);
    const byDay = await t.query(api.lib.usageByDay, range);
    expect(byDay.map((row) => row.day)).toEqual(["2026-11-01", "2026-11-02"]);
  });

  test("a range outside the data returns nothing, and a bad day is refused", async () => {
    const t = initConvexTest();
    await t.mutation(api.lib.record, { ...base, at: DAY });
    expect(
      await t.query(api.lib.usageByCustomer, {
        from: "2026-12-01",
        to: "2026-12-31",
      }),
    ).toEqual([]);
    await expect(
      t.query(api.lib.usageByCustomer, { from: "yesterday", to: "2026-12-31" }),
    ).rejects.toThrow(/YYYY-MM-DD/);
  });

  test("recent calls and run cost", async () => {
    const t = initConvexTest();
    await t.mutation(api.lib.record, {
      ...base,
      runId: "run-1",
      call: "draft-post",
      at: DAY,
    });
    await t.mutation(api.lib.record, {
      ...base,
      runId: "run-1",
      call: "verify-post",
      costUsd: 0.01,
      at: DAY + 5,
    });
    await t.mutation(api.lib.record, {
      ...base,
      customer: "other",
      at: DAY + 10,
    });
    const recent = await t.query(api.lib.recentCalls, { customer: "acme" });
    expect(recent.map((row) => row.call)).toEqual([
      "verify-post",
      "draft-post",
    ]);
    const run = await t.query(api.lib.runCost, { runId: "run-1" });
    expect(run.calls).toBe(2);
    expect(run.costUsd).toBeCloseTo(0.06);
    expect(run.steps.map((step) => step.call)).toEqual([
      "draft-post",
      "verify-post",
    ]);
  });
});

describe("budgets", () => {
  test("a customer without a budget is always allowed", async () => {
    const t = initConvexTest();
    await t.mutation(api.lib.record, { ...base, costUsd: 50, at: DAY });
    const status = await t.query(api.lib.budgetStatus, {
      customer: "acme",
      month: "2026-11",
    });
    expect(status).toMatchObject({
      limitUsd: null,
      remainingUsd: null,
      allowed: true,
      spentUsd: 50,
    });
  });

  test("a customer is blocked once its monthly spend reaches the limit", async () => {
    const t = initConvexTest();
    await t.mutation(api.lib.setBudget, { customer: "acme", monthlyUsd: 1 });
    await t.mutation(api.lib.record, { ...base, costUsd: 0.4, at: DAY });
    expect(
      await t.query(api.lib.budgetStatus, {
        customer: "acme",
        month: "2026-11",
      }),
    ).toMatchObject({
      allowed: true,
      remainingUsd: 0.6,
    });
    await t.mutation(api.lib.record, { ...base, costUsd: 0.7, at: DAY });
    expect(
      await t.query(api.lib.budgetStatus, {
        customer: "acme",
        month: "2026-11",
      }),
    ).toMatchObject({
      allowed: false,
      remainingUsd: 0,
    });
  });

  test("spend resets in a new month, and one customer's spend never counts for another", async () => {
    const t = initConvexTest();
    await t.mutation(api.lib.setBudget, { customer: "acme", monthlyUsd: 1 });
    await t.mutation(api.lib.record, { ...base, costUsd: 5, at: DAY });
    await t.mutation(api.lib.record, {
      ...base,
      customer: "other",
      costUsd: 5,
      at: DAY,
    });
    expect(
      (
        await t.query(api.lib.budgetStatus, {
          customer: "acme",
          month: "2026-12",
        })
      ).allowed,
    ).toBe(true);
    expect(
      (
        await t.query(api.lib.budgetStatus, {
          customer: "acme",
          month: "2026-11",
        })
      ).spentUsd,
    ).toBe(5);
  });

  test("a budget can be changed, cleared, and must be valid", async () => {
    const t = initConvexTest();
    await t.mutation(api.lib.setBudget, { customer: "acme", monthlyUsd: 1 });
    await t.mutation(api.lib.setBudget, { customer: "acme", monthlyUsd: 10 });
    expect(
      (
        await t.query(api.lib.budgetStatus, {
          customer: "acme",
          month: "2026-11",
        })
      ).limitUsd,
    ).toBe(10);
    await t.mutation(api.lib.clearBudget, { customer: "acme" });
    expect(
      (
        await t.query(api.lib.budgetStatus, {
          customer: "acme",
          month: "2026-11",
        })
      ).limitUsd,
    ).toBeNull();
    await expect(
      t.mutation(api.lib.setBudget, { customer: "acme", monthlyUsd: -1 }),
    ).rejects.toThrow(/zero or more/);
    await expect(
      t.query(api.lib.budgetStatus, { customer: "acme", month: "11-2026" }),
    ).rejects.toThrow(/YYYY-MM/);
  });
});

describe("purge", () => {
  test("old calls are deleted and the daily totals stay", async () => {
    const t = initConvexTest();
    await t.mutation(api.lib.record, { ...base, at: DAY });
    await t.mutation(api.lib.record, { ...base, at: DAY + 10 * 86_400_000 });
    const result = await t.mutation(api.lib.purge, {
      before: DAY + 86_400_000,
    });
    expect(result).toEqual({ deleted: 1, hasMore: false });
    expect(await t.query(api.lib.recentCalls, {})).toHaveLength(1);
    const [row] = await t.query(api.lib.usageByCustomer, {
      from: "2026-11-01",
      to: "2026-11-30",
    });
    expect(row.calls).toBe(2);
  });

  test("reports when more remain", async () => {
    const t = initConvexTest();
    for (let i = 0; i < 3; i++)
      await t.mutation(api.lib.record, { ...base, at: DAY + i });
    const result = await t.mutation(api.lib.purge, {
      before: DAY + 1000,
      limit: 2,
    });
    expect(result).toEqual({ deleted: 2, hasMore: true });
  });
});
