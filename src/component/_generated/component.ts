/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    lib: {
      budgetStatus: FunctionReference<
        "query",
        "internal",
        { customer: string; month: string },
        {
          allowed: boolean;
          customer: string;
          limitUsd: number | null;
          month: string;
          remainingUsd: number | null;
          spentUsd: number;
        },
        Name
      >;
      clearBudget: FunctionReference<
        "mutation",
        "internal",
        { customer: string },
        null,
        Name
      >;
      purge: FunctionReference<
        "mutation",
        "internal",
        { before: number; limit?: number },
        { deleted: number; hasMore: boolean },
        Name
      >;
      recentCalls: FunctionReference<
        "query",
        "internal",
        { customer?: string; limit?: number },
        Array<{
          _creationTime: number;
          _id: string;
          at: number;
          call: string;
          costSource: "reported" | "estimated" | "none";
          costUsd: number;
          customer: string;
          error?: string;
          feature: string;
          inputTokens: number;
          latencyMs: number;
          model: string;
          outputTokens: number;
          plan?: string;
          runId?: string;
          status: "ok" | "error" | "fallback";
        }>,
        Name
      >;
      record: FunctionReference<
        "mutation",
        "internal",
        {
          at?: number;
          call: string;
          costSource: "reported" | "estimated" | "none";
          costUsd: number;
          customer: string;
          error?: string;
          feature: string;
          inputTokens: number;
          latencyMs: number;
          model: string;
          outputTokens: number;
          plan?: string;
          runId?: string;
          status: "ok" | "error" | "fallback";
        },
        string,
        Name
      >;
      runCost: FunctionReference<
        "query",
        "internal",
        { runId: string },
        {
          averageLatencyMs: number;
          calls: number;
          costUsd: number;
          errors: number;
          fallbacks: number;
          inputTokens: number;
          latencyMs: number;
          outputTokens: number;
          steps: Array<{
            call: string;
            costUsd: number;
            latencyMs: number;
            model: string;
            status: "ok" | "error" | "fallback";
          }>;
        },
        Name
      >;
      setBudget: FunctionReference<
        "mutation",
        "internal",
        { customer: string; monthlyUsd: number },
        null,
        Name
      >;
      usageByCall: FunctionReference<
        "query",
        "internal",
        { customer?: string; from: string; to: string },
        Array<{
          averageLatencyMs: number;
          call: string;
          calls: number;
          costUsd: number;
          errors: number;
          fallbacks: number;
          feature: string;
          inputTokens: number;
          latencyMs: number;
          outputTokens: number;
        }>,
        Name
      >;
      usageByCustomer: FunctionReference<
        "query",
        "internal",
        { from: string; to: string },
        Array<{
          averageLatencyMs: number;
          calls: number;
          costUsd: number;
          customer: string;
          errors: number;
          fallbacks: number;
          inputTokens: number;
          latencyMs: number;
          outputTokens: number;
        }>,
        Name
      >;
      usageByDay: FunctionReference<
        "query",
        "internal",
        { customer?: string; from: string; to: string },
        Array<{
          averageLatencyMs: number;
          calls: number;
          costUsd: number;
          day: string;
          errors: number;
          fallbacks: number;
          inputTokens: number;
          latencyMs: number;
          outputTokens: number;
        }>,
        Name
      >;
      usageByFeature: FunctionReference<
        "query",
        "internal",
        { customer?: string; from: string; to: string },
        Array<{
          averageLatencyMs: number;
          calls: number;
          costUsd: number;
          errors: number;
          fallbacks: number;
          feature: string;
          inputTokens: number;
          latencyMs: number;
          outputTokens: number;
        }>,
        Name
      >;
    };
  };
