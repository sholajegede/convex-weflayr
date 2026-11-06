# Changelog

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
