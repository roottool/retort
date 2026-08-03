import { Graph } from './schema'

// Dummy data reproducing the 3-resource stack from CONTEXT.md (R2 Bucket +
// KV Namespace + Worker) in sanitized form. Excludes real data such as
// account IDs found in actual .alchemy/ state files.
export const dummyGraph: Graph = Graph.make({
  nodes: [
    { id: 'Bucket', resourceType: 'Cloudflare.R2.Bucket' },
    { id: 'Sessions', resourceType: 'Cloudflare.KV.Namespace' },
    { id: 'Api', resourceType: 'Cloudflare.Worker' },
  ],
  edges: [
    { from: 'Api', to: 'Bucket', bindingType: 'r2_bucket' },
    { from: 'Api', to: 'Sessions', bindingType: 'kv_namespace' },
  ],
})
