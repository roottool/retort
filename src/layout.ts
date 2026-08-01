import type { Graph, GraphEdge } from './schema'

export type NodePosition = {
  readonly id: string
  readonly x: number
  readonly y: number
}

const LAYER_SPACING_X = 320
const ROW_SPACING_Y = 120

// graph.edges の向き(from = bindingしている側 → to = binding先)に沿って、
// 一度も binding先になっていないノード(典型的にはWorker)をレイヤー0とし、
// エッジをたどるごとに +1 する。DAGの最長経路はノード数-1ホップを超えない
// ので、パス数をノード数で打ち切れば必ず収束する。外部(.alchemy/配下)から
// 読んだデータに想定外の循環bindingが混ざっていても無限ループしない。
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

// 隣接列(neighborColumn)内での並び順の平均を各ノードのバリセンターとし、
// それで昇順に並べ替える。エッジ交差を減らすための簡易ヒューリスティック。
// 隣接ノードを持たないノードは末尾に固定し、同点はid昇順でタイブレークして
// 決定的な結果にする。
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

// 左→右のバリセンター整列を1パス、続けて右→左を1パス行う
// (Sugiyama式レイアウトの簡易版)。小規模グラフを想定した用途なので、
// 収束判定はせず固定2パスに留める。
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
    // 短い列は縦方向に中央揃えする。オフセットは常に0以上なので、
    // どの列も y が負にならず、SVGの描画範囲からはみ出さない。
    const verticalOffset = ((maxRows - column.length) / 2) * ROW_SPACING_Y

    return column.map((id, rowIndex) => ({
      id,
      x: layerIndex * LAYER_SPACING_X,
      y: verticalOffset + rowIndex * ROW_SPACING_Y,
    }))
  })
}
