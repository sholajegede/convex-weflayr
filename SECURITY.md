# Security

## Report a problem

Report a vulnerability in private through
[GitHub security advisories](https://github.com/sholajegede/convex-weflayr/security/advisories/new).
Please do not open a public issue. You get a first reply within three working
days.

## Supported versions

Only the latest minor version gets fixes while the package is below 1.0.

## How the component handles secrets and data

- The Weflayr API key is read from your Convex environment
  (`WEFLAYR_API_KEY`) or passed to the `Weflayr` constructor. The component
  never writes it to a table or to a log.
- The component stores customer name, call name, feature, plan, model, token
  counts, cost, latency, status and a short error message. It does not store
  prompts or answers.
- Customer names are also sent to Weflayr in the `x-weflayr-metadata` header.
  Use an id, not an email address or a full name.
- The example app takes the key from the visitor's browser and sends it with
  each call. It keeps the key in localStorage and never saves it in the
  database.

## For maintainers

- npm releases are built by CI with provenance, from a version tag. See
  [PUBLISHING.md](./PUBLISHING.md).
- Dependency updates come from Renovate. CodeQL runs on every push and weekly.
