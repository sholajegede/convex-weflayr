# Changelog

## 0.2.0

- Routing strategies: `strategy(id, version)`, a `models` map per call name and a `defaultModel`; each call is saved with the model the strategy picked (`requestedModel` keeps what was asked)
- The customer on every call: `callMeta` reads it from the signed-in user or your `customer` function, and a call without one throws unless `missingCustomer: "warn"`
- `runId` is sent as Weflayr's `feature_run_uuid` and must be 32 lowercase hex characters; `newRunId()` now makes one. It was sent as a `run_id` tag before
- Revenue and plan into Weflayr: `sendRevenue` (upserts, retried on 429 and 5xx) and `tagCustomers`
- `sync` saves each customer's real cost, revenue, margin and risk status for the month, and `customerStatus` reads it
- Budgets use that real cost plus recent estimates (`settleMs`), and `assertWithinBudget` can stop on `stopOnMargin` statuses (`WeflayrMarginError`)
- The gateway's `weflayr_warnings` are logged and saved with the call
- New `synced` table; the `calls` table gains `requestedModel` and `warnings`
- The README leads with strategies, the customer on every call, revenue and margin

## 0.1.1

- The diagram is now an image, so it shows on npm as well as GitHub
- README images use full GitHub addresses, so they load on npm
- A budget error shows small amounts in full, such as $0.00002
- README section on recording streamed calls with `onFinish`
- Test files are left out of the published package

## 0.1.0

- Gateway helper: `metadata`, `headers`, `connection`, an allow list of
  customers and a feature map per call name
- Per call tracking with `track` and `withFallback`: customer, call, model,
  tokens, cost, latency and status
- Daily totals by customer, call, feature and day, and the cost of one run
- Monthly budgets per customer with `assertWithinBudget`
- `purge` to delete old calls while keeping daily totals
- `convex-weflayr/ai-sdk` to build a Vercel AI SDK model for the gateway
- Example app: bring your own Weflayr key, kept in the browser's localStorage
  and never saved in the database
- CI on Node 20 and 22, CodeQL, tag-driven npm releases with provenance
