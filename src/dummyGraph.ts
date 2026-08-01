import { Graph } from './schema'

// CONTEXT.md記載の3リソース構成(R2 Bucket + KV Namespace + Worker)を
// サニタイズした状態で再現したダミーデータ。実際の .alchemy/ 配下の
// stateファイルに含まれるアカウントID等の実データは含めない。
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
