import { Schema as S } from 'effect'

// GraphNode/GraphEdge/Graph represent the resource dependency graph extracted
// from Alchemy's .alchemy/ state. Looking only at the bindings side (the
// referencing side) is enough to reconstruct the full graph, so an edge's
// direction is "the side doing the binding -> the binding target".

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
