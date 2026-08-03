import type { Graph, GraphEdge } from './schema'

export type NodePosition = {
  readonly id: string
  readonly x: number
  readonly y: number
}

const LAYER_SPACING_X = 320
const ROW_SPACING_Y = 120

// Following the direction of graph.edges (from = the side doing the binding
// → to = the binding target), nodes that are never a binding target
// (typically the Worker) start at layer 0, and each edge traversal adds +1.
// A DAG's longest path never exceeds node-count - 1 hops, so capping the
// number of passes at the node count guarantees convergence. This also means
// no infinite loop even if data read from an external source (.alchemy/)
// contains an unexpected binding cycle.
const assignLayers = (graph: Graph): Map<string, number> => {
  const layers = new Map(graph.nodes.map(node => [node.id, 0]))

  for (let pass = 0; pass < graph.nodes.length; pass++) {
    let changed = false
    for (const edge of graph.edges) {
      const fromLayer = layers.get(edge.from)
      const toLayer = layers.get(edge.to)
      if (fromLayer === undefined || toLayer === undefined) continue

      const candidate = fromLayer + 1
      if (candidate > toLayer) {
        layers.set(edge.to, candidate)
        changed = true
      }
    }
    if (!changed) break
  }

  return layers
}

const groupByLayer = (graph: Graph, layers: Map<string, number>): string[][] => {
  const maxLayer = Math.max(0, ...layers.values())
  const columns: string[][] = Array.from({ length: maxLayer + 1 }, () => [])
  for (const node of graph.nodes) {
    columns[layers.get(node.id) ?? 0]!.push(node.id)
  }
  return columns
}

// Each node's barycenter is the average position of its neighbors within
// the adjacent column (neighborColumn), and nodes are sorted ascending by
// that value. A simple heuristic for reducing edge crossings. Nodes with no
// neighbors are pinned to the end, and ties are broken by ascending id so
// the result stays deterministic.
const barycenterOrder = (
  column: ReadonlyArray<string>,
  neighborColumn: ReadonlyArray<string>,
  edges: ReadonlyArray<GraphEdge>,
  neighborsOf: (nodeId: string) => ReadonlyArray<string>,
): string[] => {
  const neighborIndex = new Map(neighborColumn.map((id, index) => [id, index]))

  const barycenterOf = (nodeId: string): number => {
    const positions = neighborsOf(nodeId)
      .map(id => neighborIndex.get(id))
      .filter((index): index is number => index !== undefined)
    return positions.length === 0
      ? Infinity
      : positions.reduce((sum, index) => sum + index, 0) / positions.length
  }

  return [...column].sort((a, b) => {
    const diff = barycenterOf(a) - barycenterOf(b)
    return diff !== 0 ? diff : a.localeCompare(b)
  })
}

const predecessorsOf = (edges: ReadonlyArray<GraphEdge>, nodeId: string): string[] =>
  edges.filter(edge => edge.to === nodeId).map(edge => edge.from)

const successorsOf = (edges: ReadonlyArray<GraphEdge>, nodeId: string): string[] =>
  edges.filter(edge => edge.from === nodeId).map(edge => edge.to)

// One left→right barycenter pass, followed by one right→left pass (a
// simplified Sugiyama-style layout). Since this is meant for small graphs,
// we skip convergence checking and stick to a fixed 2 passes.
const reorderColumns = (
  columns: ReadonlyArray<ReadonlyArray<string>>,
  edges: ReadonlyArray<GraphEdge>,
): string[][] => {
  const ordered = columns.map(column => [...column])

  for (let i = 1; i < ordered.length; i++) {
    ordered[i] = barycenterOrder(ordered[i]!, ordered[i - 1]!, edges, id =>
      predecessorsOf(edges, id),
    )
  }
  for (let i = ordered.length - 2; i >= 0; i--) {
    ordered[i] = barycenterOrder(ordered[i]!, ordered[i + 1]!, edges, id =>
      successorsOf(edges, id),
    )
  }

  return ordered
}

export const layoutNodes = (graph: Graph): ReadonlyArray<NodePosition> => {
  const columns = reorderColumns(groupByLayer(graph, assignLayers(graph)), graph.edges)
  const maxRows = Math.max(1, ...columns.map(column => column.length))

  return columns.flatMap((column, layerIndex) => {
    // Shorter columns are centered vertically. The offset is always >= 0,
    // so no column's y goes negative, keeping everything inside the SVG's
    // drawing area.
    const verticalOffset = ((maxRows - column.length) / 2) * ROW_SPACING_Y

    return column.map((id, rowIndex) => ({
      id,
      x: layerIndex * LAYER_SPACING_X,
      y: verticalOffset + rowIndex * ROW_SPACING_Y,
    }))
  })
}
