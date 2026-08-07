# retort

A web page that shows you the infrastructure that is currently serving it.

Deploy the sample stack, open the URL, and by default you're looking at a live diagram of
the exact Cloudflare resources rendering that diagram in front of you — the `Api` Worker
serves this viewer as a static asset, and the viewer's own default graph is that same
Worker's deployment state.

Under the hood, `retort` reads the deployment state of a Cloudflare stack managed by
[Alchemy](https://alchemy.run) (Infrastructure-as-Effects), extracts a dependency graph of
the cloud resources, and renders it with [Foldkit](https://foldkit.dev) (an Elm-like
frontend framework). Both happen to be built on [Effect](https://effect.website), the
TypeScript functional ecosystem — which is also where the name comes from: Alchemy's own
metaphor is a *retort*, the vessel used in distillation. The graph leans into that metaphor
visually too: nodes render as flasks filled with a gradient liquid, and dependency edges
carry a flowing droplet animation.

## What it does

Alchemy can persist deployment state as plain JSON files on disk (via
`State.localState()`) instead of a remote state store. This project reads that local
state, extracts a dependency graph of your cloud resources (which resource binds to
which), and renders it as an interactive diagram in the browser.

The sample stack's `Api` Worker also serves this project's own built viewer as a static
asset (see `alchemy.run.ts`) — so once deployed, the graph it shows by default is its own.

## Scope

- **Cloudflare only.** Other providers (AWS, etc.) are out of scope.
- This is a throwaway proof of concept, not a maintained package. There is no npm
  publish plan.

## Prerequisites

- A Cloudflare account.
- [Bun](https://bun.sh).

## Getting started

```bash
bun install

# Build the viewer so the Api Worker has something under ./dist to deploy as
# a static asset (see alchemy.run.ts).
bun run build

# Deploy the sample stack (KV Namespace + D1 Database + 2 Workers) to
# Cloudflare. This writes local state files under .alchemy/state/ (gitignored
# — they contain real account/resource identifiers).
bunx alchemy deploy

# Read .alchemy/state/**/*.json and write src/graph.generated.json.
bun run parse-alchemy

# Start the dev server (hot-reloading; separate from the static build above).
bun run dev
```

Open the dev server URL and you'll see each resource as a labeled box, with edges
showing which resource binds to which (e.g. the `Api` Worker binding a KV Namespace, a
D1 Database, the `Auth` Worker via a service binding, and the static assets it serves).
Clicking a node highlights it and its directly connected neighbors, dimming the rest of
the graph.

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
resource depends on. The `Api` Worker's state file, for example, lists the KV Namespace,
D1 Database, and `Auth` Worker it binds to, each tagged with a `sid` (the target's
`logicalId`) and a binding `type` (`kv_namespace`, `d1`, `service`, etc.). Reading
`bindings` alone is enough to reconstruct almost the full dependency graph — nodes come
from each file's `logicalId` / `resourceType`, edges from `bindings`.

The one exception is the static assets a Worker serves (`assets` in `alchemy.run.ts`):
that's a plain prop on the Worker's own state file, not a `bindings` entry, so
`scripts/parse-alchemy.ts` special-cases it — a Worker with `props.assets` set gets a
synthetic `Viewer` node and an edge pointing at it.

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
