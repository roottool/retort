import { Graph } from './schema'

// Dummy data reproducing the stack from CONTEXT.md (KV Namespace + D1
// Database + 2 Workers + a self-served Assets viewer) in sanitized form.
// Excludes real data such as account IDs found in actual .alchemy/ state
// files. `Db` is reachable both directly from `Api` and via `Auth`, so the
// layered DAG layout in layout.ts has an actual crossing to reduce.
export const dummyGraph: Graph = Graph.make({
  nodes: [
    { id: 'Api', resourceType: 'Cloudflare.Worker' },
    { id: 'Auth', resourceType: 'Cloudflare.Worker' },
    { id: 'Sessions', resourceType: 'Cloudflare.KV.Namespace' },
    { id: 'Db', resourceType: 'Cloudflare.D1Database' },
    { id: 'Viewer', resourceType: 'Cloudflare.Workers.Assets' },
  ],
  edges: [
    { from: 'Api', to: 'Sessions', bindingType: 'kv_namespace' },
    { from: 'Api', to: 'Db', bindingType: 'd1' },
    { from: 'Api', to: 'Auth', bindingType: 'service' },
    { from: 'Auth', to: 'Db', bindingType: 'd1' },
    { from: 'Api', to: 'Viewer', bindingType: 'assets' },
  ],
})
