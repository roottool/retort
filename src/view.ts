import { Array, Option, pipe } from 'effect'
import type { Document, Html, HtmlBuilder } from 'foldkit/html'

import { layoutNodes } from './layout'
import type { NodePosition } from './layout'
import { ClickedNode } from './main'
import type { Message, Model } from './main'
import type { GraphEdge, GraphNode } from './schema'

// VIEW

const NODE_WIDTH = 180
const NODE_HEIGHT = 64
const CANVAS_PADDING = 40

const resourceTypeFill = (resourceType: string): string => {
  if (resourceType.includes('R2')) return '#ea580c'
  if (resourceType.includes('KV')) return '#2563eb'
  if (resourceType.includes('Worker')) return '#16a34a'
  return '#64748b'
}

const findPosition = (
  positions: ReadonlyArray<NodePosition>,
  id: string,
): Option.Option<NodePosition> =>
  Array.findFirst(positions, position => position.id === id)

const centerOf = (position: NodePosition): { x: number; y: number } => ({
  x: position.x + NODE_WIDTH / 2,
  y: position.y + NODE_HEIGHT / 2,
})

// レイヤーDAGレイアウトではノードが縦にもずれるため、接続点は中心同士を
// 結ぶ直線とノード矩形の交点にする(角度によらず矩形の辺で止まる)。
const clipToRectBoundary = (
  center: { x: number; y: number },
  towards: { x: number; y: number },
): { x: number; y: number } => {
  const dx = towards.x - center.x
  const dy = towards.y - center.y
  if (dx === 0 && dy === 0) return center

  const scaleX = dx !== 0 ? NODE_WIDTH / 2 / Math.abs(dx) : Infinity
  const scaleY = dy !== 0 ? NODE_HEIGHT / 2 / Math.abs(dy) : Infinity
  const scale = Math.min(scaleX, scaleY)

  return { x: center.x + dx * scale, y: center.y + dy * scale }
}

const edgeEndpoints = (
  fromPosition: NodePosition,
  toPosition: NodePosition,
): { readonly from: { x: number; y: number }; readonly to: { x: number; y: number } } => {
  const fromCenter = centerOf(fromPosition)
  const toCenter = centerOf(toPosition)

  return {
    from: clipToRectBoundary(fromCenter, toCenter),
    to: clipToRectBoundary(toCenter, fromCenter),
  }
}

const nodeView = (
  node: GraphNode,
  position: NodePosition,
  isSelected: boolean,
  h: HtmlBuilder<Message>,
): Html =>
  h.g(
    [
      h.Id(node.id),
      h.Transform(`translate(${position.x}, ${position.y})`),
      h.OnClick(ClickedNode({ id: node.id })),
      h.Class('cursor-pointer'),
    ],
    [
      h.rect(
        [
          h.Width(String(NODE_WIDTH)),
          h.Height(String(NODE_HEIGHT)),
          h.Rx('8'),
          h.Fill(resourceTypeFill(node.resourceType)),
          h.Stroke(isSelected ? '#1e293b' : 'none'),
          h.StrokeWidth('3'),
        ],
        [],
      ),
      h.text(
        [
          h.X(String(NODE_WIDTH / 2)),
          h.Y('26'),
          h.TextAnchor('middle'),
          h.Fill('white'),
          h.FontSize('14'),
          h.FontWeight('700'),
        ],
        [node.id],
      ),
      h.text(
        [
          h.X(String(NODE_WIDTH / 2)),
          h.Y('44'),
          h.TextAnchor('middle'),
          h.Fill('white'),
          h.FontSize('11'),
        ],
        [node.resourceType],
      ),
    ],
  )

const edgeView = (
  edge: GraphEdge,
  positions: ReadonlyArray<NodePosition>,
  h: HtmlBuilder<Message>,
): Html =>
  pipe(
    Option.all([findPosition(positions, edge.from), findPosition(positions, edge.to)]),
    Option.map(([fromPosition, toPosition]) => {
      const { from, to } = edgeEndpoints(fromPosition, toPosition)
      const midX = (from.x + to.x) / 2
      const midY = (from.y + to.y) / 2

      return h.g(
        [],
        [
          h.line(
            [
              h.X1(String(from.x)),
              h.Y1(String(from.y)),
              h.X2(String(to.x)),
              h.Y2(String(to.y)),
              h.Stroke('#94a3b8'),
              h.StrokeWidth('2'),
              h.MarkerEnd('url(#edge-arrowhead)'),
            ],
            [],
          ),
          h.text(
            [
              h.X(String(midX)),
              h.Y(String(midY - 6)),
              h.TextAnchor('middle'),
              h.FontSize('10'),
              h.Fill('#475569'),
            ],
            [edge.bindingType],
          ),
        ],
      )
    }),
    Option.getOrElse(() => h.empty),
  )

const svgWidth = (positions: ReadonlyArray<NodePosition>): number =>
  Math.max(NODE_WIDTH, ...Array.map(positions, position => position.x + NODE_WIDTH)) +
  CANVAS_PADDING * 2

const svgHeight = (positions: ReadonlyArray<NodePosition>): number =>
  Math.max(NODE_HEIGHT, ...Array.map(positions, position => position.y + NODE_HEIGHT)) +
  CANVAS_PADDING * 2

const selectedDetailView = (model: Model, h: HtmlBuilder<Message>): Html =>
  pipe(
    model.selectedNodeId,
    Option.flatMap(id => Array.findFirst(model.graph.nodes, node => node.id === id)),
    Option.match({
      onNone: () =>
        h.p(
          [h.Class('text-sm text-stone-500')],
          ['ノードをクリックすると詳細が表示されます'],
        ),
      onSome: node =>
        h.p(
          [h.Class('text-sm text-stone-900')],
          [`選択中: ${node.id} (${node.resourceType})`],
        ),
    }),
  )

export const view = (model: Model, h: HtmlBuilder<Message>): Document => {
  const positions = layoutNodes(model.graph)
  const width = svgWidth(positions)
  const height = svgHeight(positions)

  return {
    title: 'retort — Alchemy graph viewer',
    body: h.div(
      [h.Class('min-h-screen bg-stone-100 p-8 text-stone-900')],
      [
        h.h1([h.Class('mb-4 font-serif text-2xl')], ['Alchemy graph']),
        h.svg(
          [
            h.ViewBox(`0 0 ${width} ${height}`),
            h.Width(String(width)),
            h.Height(String(height)),
            h.Class('border border-stone-300 bg-white'),
          ],
          [
            h.defs(
              [],
              [
                h.marker(
                  [
                    h.Id('edge-arrowhead'),
                    h.ViewBox('0 0 10 10'),
                    h.RefX('9'),
                    h.RefY('5'),
                    h.MarkerWidth('7'),
                    h.MarkerHeight('7'),
                    h.Orient('auto-start-reverse'),
                  ],
                  [h.path([h.D('M 0 0 L 10 5 L 0 10 z'), h.Fill('#94a3b8')], [])],
                ),
              ],
            ),
            h.g(
              [h.Transform(`translate(${CANVAS_PADDING}, ${CANVAS_PADDING})`)],
              [
                ...Array.map(model.graph.edges, edge => edgeView(edge, positions, h)),
                ...Array.map(model.graph.nodes, node =>
                  pipe(
                    findPosition(positions, node.id),
                    Option.map(position =>
                      nodeView(
                        node,
                        position,
                        Option.contains(model.selectedNodeId, node.id),
                        h,
                      ),
                    ),
                    Option.getOrElse(() => h.empty),
                  ),
                ),
              ],
            ),
          ],
        ),
        h.div([h.Class('mt-4')], [selectedDetailView(model, h)]),
      ],
    ),
  }
}
