# Contributing

## Set up

```sh
npm install
npm run dev
```

`npm run dev` starts a Convex dev deployment (you log in the first time), the
example app, and a watcher that rebuilds the component on every change. The
example app reads `VITE_CONVEX_URL` from `.env.local`. Copy the value of
`CONVEX_URL` into it.

## Before you open a pull request

```sh
npm run build
npm run lint
npm run typecheck
npm test
```

CI runs the same four commands on Node 20 and 22, builds the example app, and
checks the package contents. A pull request needs all of them green.

## Where things are

| Path                | What it holds                                                |
| ------------------- | ------------------------------------------------------------ |
| `src/component`     | The Convex component: schema and functions                   |
| `src/client`        | The `Weflayr` class your app imports                         |
| `src/ai-sdk`        | `weflayrModel`, the Vercel AI SDK model for the gateway      |
| `src/test.ts`       | `register()` for apps that test with `convex-test`           |
| `example`           | The demo app: Convex functions and a Vite + React frontend   |
| `docs`              | Architecture and operations notes                            |

## Rules

- A change to the schema must be backward compatible: add optional fields,
  never rename or remove one. Apps that already installed the component keep
  their data.
- Every new behaviour has a test in `src/**/*.test.ts`.
- Update `README.md` and `CHANGELOG.md` when the public API changes.
- The component never stores prompts, answers or API keys.

## Releases

Maintainers release by tag. See [PUBLISHING.md](./PUBLISHING.md).
