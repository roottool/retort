import { Array } from 'effect'

import type { Graph } from './schema'

export type NodePosition = {
  readonly id: string
  readonly x: number
  readonly y: number
}

const NODE_SPACING_X = 320
const NODE_ROW_Y = 0

// 暫定実装: ノードを横一列に等間隔で並べるだけの決定的なレイアウト。
// TODO(user): エッジが交差しやすいので、bindingしている側/されている側で
// 段を分ける、force-directed的にばらけさせる等、より読みやすい配置に
// 差し替えてください。graph.edges を使えば依存の向きを考慮できます。
export const layoutNodes = (graph: Graph): ReadonlyArray<NodePosition> =>
  Array.map(graph.nodes, (node, index) => ({
    id: node.id,
    x: index * NODE_SPACING_X,
    y: NODE_ROW_Y,
  }))
