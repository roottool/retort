# retort

A one-off visualization tool for [Alchemy](https://alchemy.run) (Infrastructure-as-Effects)
deployment state, rendered with [Foldkit](https://foldkit.dev) (an Elm-like frontend
framework built on Effect).

Both Alchemy and Foldkit are built on [Effect](https://effect.website), the TypeScript
functional ecosystem — that shared foundation is the reason for pairing them, and for the
name: Alchemy's own metaphor is a *retort*, the vessel used in distillation.

## What it does

Alchemy can persist deployment state as plain JSON files on disk (via
`State.localState()`) instead of a remote state store. This project reads that local
state, extracts a dependency graph of your cloud resources (which resource binds to
which), and renders it as an interactive diagram in the browser.

## Scope

- **Cloudflare only.** Other providers (AWS, etc.) are out of scope.
- This is a throwaway proof of concept, not a maintained package. There is no npm
  publish plan.

## Prerequisites

- A Cloudflare account, with **R2 enabled from the dashboard** (deploys fail with
  `Forbidden: Please enable R2 through the Cloudflare Dashboard.` otherwise).
- [Bun](https://bun.sh).

## Getting started

```bash
bun install

# Deploy the sample stack (R2 Bucket + KV Namespace + Worker) to Cloudflare.
# This writes local state files under .alchemy/state/ (gitignored — they contain
# real account/resource identifiers).
bunx alchemy deploy

# Read .alchemy/state/**/*.json and write src/graph.generated.json.
bun run parse-alchemy

# Start the viewer.
bun run dev
```

Open the dev server URL and you'll see each resource as a labeled box, with edges
showing which resource binds to which (e.g. a Worker binding an R2 Bucket and a KV
Namespace).

If you skip the deploy/parse steps, the app falls back to a small built-in dummy graph
(same shape as the sample stack) so the viewer still renders something out of the box.

## Scripts

| Command                 | Description                                              |
| ------------------------ | --------------------------------------------------------- |
| `bun run dev`             | Start the Vite dev server                                 |
| `bun run build`           | Build for production                                       |
| `bun run preview`         | Preview the production build                                |
| `bun run parse-alchemy`   | Regenerate `src/graph.generated.json` from `.alchemy/state/` |
| `bun run typecheck`       | Type-check with `tsc --noEmit`                              |
| `bun run test`            | Run the test suite (`vitest`)                               |
| `bun run lint`            | Lint `src/` (`oxlint`)                                      |
| `bun run format`          | Format the repo (`prettier`)                                |

## How the graph is derived

Each Alchemy state file (one per resource) has a `bindings` array listing what that
resource depends on. A Worker's state file, for example, lists the R2 Bucket and KV
Namespace it binds to, each tagged with a `sid` (the target's `logicalId`) and a binding
`type` (`r2_bucket`, `kv_namespace`, etc.). Reading `bindings` alone is enough to
reconstruct the full dependency graph — nodes come from each file's `logicalId` /
`resourceType`, edges from `bindings`.

## Built on Effect — testing & devtools

The viewer itself is as much a demo of Foldkit's Effect-based testing/devtools story as it
is a demo of the graph it renders:

- **Schema-validated at every boundary.** `scripts/parse-alchemy.ts` decodes each raw
  Alchemy state file with an Effect `Schema.Struct` before it ever becomes a node/edge —
  unrelated fields (`attr`, `props`, account IDs, ...) are silently dropped rather than
  leaking into `graph.generated.json`. `src/main.ts` decodes that generated file again at
  runtime with `Schema.decodeUnknownOption`, so a malformed or stale
  `graph.generated.json` falls back to `dummyGraph` instead of crashing the app.
- **`update` tested with no DOM at all.** `src/story.test.ts` uses `foldkit/story`'s
  `given`/`message`/`model` DSL to dispatch messages straight at the `update` function and
  assert on the resulting model and emitted commands.
- **`view` tested without a browser.** `src/scene.test.ts` uses `foldkit/scene`'s
  `click`/`selector`/`text` DSL to drive the real `view` + `update` pair under
  `happy-dom` and assert on rendered output — e.g. clicking `#Bucket` and checking the
  detail panel text.
- **Time-travel devtools, live.** `src/entry.ts` wires `@foldkit/devtools`'s `overlay`
  into the running app, giving Elm-style time travel in the browser. The
  `foldkit-devtools` MCP server (`.mcp.json`) exposes the same runtime to AI agents: list
  dispatched messages, replay to any keyframe, diff two models, or dispatch synthetic
  messages, all without adding a single `console.log`.

## Known limitations

- No file-watching / live reload of `.alchemy/state/` yet; re-run `bun run parse-alchemy`
  after each deploy.

## License

MIT — see [LICENSE](./LICENSE).
