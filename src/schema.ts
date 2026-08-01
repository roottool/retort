import { Schema as S } from 'effect'

// GraphNode/GraphEdge/Graph は Alchemy の .alchemy/ state から抽出した
// リソース依存グラフを表す。bindings 側(参照する側)だけを見れば
// グラフは完全に組めるため、Edge の向きは「bindingsしている側 -> binding先」。

export const GraphNode = S.Struct({
  id: S.String,
  resourceType: S.String,
})
export type GraphNode = typeof GraphNode.Type

export const GraphEdge = S.Struct({
  from: S.String,
  to: S.String,
  bindingType: S.String,
})
export type GraphEdge = typeof GraphEdge.Type

export const Graph = S.Struct({
  nodes: S.Array(GraphNode),
  edges: S.Array(GraphEdge),
})
export type Graph = typeof Graph.Type
