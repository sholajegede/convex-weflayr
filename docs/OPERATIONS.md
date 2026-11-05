# Running it in production

## Keys

- Keep `WEFLAYR_API_KEY` in the Convex environment of each deployment. Use a
  different key for dev and prod, so you can rotate one without the other.
- To rotate: create a new key in the Weflayr dashboard, run
  `npx convex env set WEFLAYR_API_KEY <new key> --prod`, then delete the old
  key. No code change or deploy is needed.
- Never put the key in a client bundle. Call the gateway only from Convex
  actions.

## Who goes through the gateway

`WEFLAYR_CUSTOMERS` is the allow list. Roll out in steps: start with one
customer, check their numbers in Weflayr and in your tables, then widen the
list, then set it to `*`. A customer outside the list calls the model direct and
is not recorded.

## Budgets

- Set a budget for every customer on a paid plan, from the same place you
  change their plan.
- Warn before you block. Read `weflayr.budget(ctx, customer)` and show a notice
  at 80% of `limitUsd`.
- Budgets reset on the first of each UTC month. Nothing needs to run.

## Data size and retention

- `calls` grows with every call. Delete old rows on a schedule and keep the
  `daily` totals:

  ```ts
  // convex/crons.ts
  import { cronJobs } from "convex/server";
  import { internal } from "./_generated/api";

  const crons = cronJobs();
  crons.daily("purge old calls", { hourUTC: 3, minuteUTC: 0 }, internal.maintenance.purge, {});
  export default crons;
  ```

  ```ts
  // convex/maintenance.ts
  export const purge = internalMutation({
    args: {},
    handler: async (ctx) => {
      const ninetyDays = Date.now() - 90 * 24 * 60 * 60 * 1000;
      await weflayr.purge(ctx, ninetyDays);
    },
  });
  ```

- `daily` has one row per customer, call and day. It stays small.

## Watching it

- A rising `errors` count in `usageByCall` means a model, key or balance
  problem. A 402 from the gateway means the Weflayr balance is empty.
- A customer whose cost is `0` with calls above zero means a model is missing
  from `prices`.
- Compare the sum of `costUsd` for a day with the Weflayr dashboard. A big gap
  means your `prices` table is out of date.

## Upgrading

- Read the CHANGELOG first. Patch and minor versions keep your data.
- Schema changes only ever add optional fields, so a deploy never needs a
  migration.
- Pin the version in `package.json` while the package is below 1.0.
