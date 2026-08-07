import { Array, Option, pipe } from 'effect'
import type { Document, Html, HtmlBuilder } from 'foldkit/html'

import { layoutNodes } from './layout'
import type { NodePosition } from './layout'
import { ClickedNode } from './main'
import type { Message, Model } from './main'
import type { Graph, GraphEdge, GraphNode } from './schema'

// VIEW

const NODE_WIDTH = 180
const NODE_HEIGHT = 64
const CANVAS_PADDING = 40

// Each resource type gets a two-stop gradient (light top, saturated bottom)
// so the node body reads as liquid settled in a flask rather than a flat
// rectangle. Defined once in <defs> and referenced by id from every node of
// that type.
type FlaskPalette = { readonly gradientId: string; readonly top: string; readonly bottom: string }

const flaskPaletteFor = (resourceType: string): FlaskPalette => {
  // 'Cloudflare.Workers.Assets' also contains 'Worker', so this check must
  // come first.
  if (resourceType.includes('Assets'))
    return { gradientId: 'flask-amber', top: '#fbbf24', bottom: '#b45309' }
  if (resourceType.includes('D1'))
    return { gradientId: 'flask-violet', top: '#c4b5fd', bottom: '#6d28d9' }
  if (resourceType.includes('KV'))
    return { gradientId: 'flask-blue', top: '#93c5fd', bottom: '#1d4ed8' }
  if (resourceType.includes('Worker'))
    return { gradientId: 'flask-green', top: '#86efac', bottom: '#15803d' }
  return { gradientId: 'flask-slate', top: '#cbd5e1', bottom: '#475569' }
}

const FLASK_PALETTES: ReadonlyArray<FlaskPalette> = [
  flaskPaletteFor('Assets'),
  flaskPaletteFor('D1'),
  flaskPaletteFor('KV'),
  flaskPaletteFor('Worker'),
  flaskPaletteFor(''),
]

// Highlight state for a node/edge relative to the current selection: the
// selected node itself, a node/edge directly connected to it, or everything
// else (dimmed so the connection stands out).
type NodeHighlight = 'selected' | 'neighbor' | 'dimmed' | 'normal'
type EdgeHighlight = 'touching' | 'dimmed' | 'normal'

const neighborsOf = (
  edges: ReadonlyArray<GraphEdge>,
  id: string,
): ReadonlySet<string> => {
  const neighbors = new Set<string>()
  for (const edge of edges) {
    if (edge.from === id) neighbors.add(edge.to)
    if (edge.to === id) neighbors.add(edge.from)
  }
  return neighbors
}

const nodeHighlightOf = (
  selectedNodeId: Option.Option<string>,
  neighbors: ReadonlySet<string>,
  nodeId: string,
): NodeHighlight =>
  pipe(
    selectedNodeId,
    Option.match({
      onNone: () => 'normal' as const,
      onSome: selectedId => {
        if (nodeId === selectedId) return 'selected' as const
        if (neighbors.has(nodeId)) return 'neighbor' as const
        return 'dimmed' as const
      },
    }),
  )

const edgeHighlightOf = (
  selectedNodeId: Option.Option<string>,
  edge: GraphEdge,
): EdgeHighlight =>
  pipe(
    selectedNodeId,
    Option.match({
      onNone: () => 'normal' as const,
      onSome: selectedId =>
        edge.from === selectedId || edge.to === selectedId
          ? ('touching' as const)
          : ('dimmed' as const),
    }),
  )

const NODE_STROKE: Record<NodeHighlight, string> = {
  selected: '#1e293b',
  neighbor: '#f59e0b',
  dimmed: 'none',
  normal: 'none',
}

const NODE_OPACITY: Record<NodeHighlight, string> = {
  selected: '1',
  neighbor: '1',
  dimmed: '0.35',
  normal: '1',
}

const EDGE_STROKE: Record<EdgeHighlight, string> = {
  touching: '#f59e0b',
  dimmed: '#94a3b8',
  normal: '#94a3b8',
}

const EDGE_WIDTH: Record<EdgeHighlight, string> = {
  touching: '3',
  dimmed: '2',
  normal: '2',
}

const EDGE_OPACITY: Record<EdgeHighlight, string> = {
  touching: '1',
  dimmed: '0.25',
  normal: '1',
}

const EDGE_MARKER: Record<EdgeHighlight, string> = {
  touching: 'url(#edge-arrowhead-highlight)',
  dimmed: 'url(#edge-arrowhead)',
  normal: 'url(#edge-arrowhead)',
}

// A touching edge gets a brighter, faster-moving droplet to read as "actively
// flowing"; everything else gets a slower, dimmer one so the canvas still
// feels alive at rest without competing for attention.
const BUBBLE_RADIUS: Record<EdgeHighlight, string> = {
  touching: '4',
  dimmed: '2.5',
  normal: '2.5',
}

const BUBBLE_DURATION: Record<EdgeHighlight, string> = {
  touching: '1.2s',
  dimmed: '2.6s',
  normal: '2.6s',
}

// Deterministic (no Math.random) so the same graph always renders the same
// way. Only used to desynchronize droplets across edges, not for anything
// that needs to be cryptographically distributed.
const hashString = (value: string): number => {
  let hash = 0
  for (let index = 0; index < value.length; index++) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0
  }
  return Math.abs(hash)
}

// A negative `begin` starts the animation as if it had already been running
// for that long, which is how SVG SMIL staggers otherwise-identical loops.
const bubbleBeginOffset = (edge: GraphEdge, duration: string): string => {
  const durationSeconds = Number.parseFloat(duration)
  const offset = (hashString(`${edge.from}->${edge.to}`) % 100) / 100
  return `-${(offset * durationSeconds).toFixed(2)}s`
}

const findPosition = (
  positions: ReadonlyArray<NodePosition>,
  id: string,
): Option.Option<NodePosition> =>
  Array.findFirst(positions, position => position.id === id)

type PortOffsets = { readonly fromOffset: number; readonly toOffset: number }

const edgeKey = (edge: GraphEdge): string => `${edge.from}->${edge.to}`

// How far apart two ports can be pushed, as a fraction of the node's height.
const PORT_SPREAD = NODE_HEIGHT * 0.6

// When several edges share a source (or target) node, connecting them all
// through that node's center makes lines that leave at nearly the same angle
// overlap almost entirely near the shared endpoint (e.g. Api -> Sessions and
// Api -> Db). Spreading each node's edges along its right/left edge —
// ordered by where the other endpoint sits — keeps them visually distinct.
const buildPortOffsets = (
  graph: Graph,
  positions: ReadonlyArray<NodePosition>,
): ReadonlyMap<string, PortOffsets> => {
  const yOf = (id: string): number =>
    pipe(
      findPosition(positions, id),
      Option.map(position => position.y),
      Option.getOrElse(() => 0),
    )

  const spreadOffsets = (
    group: ReadonlyArray<GraphEdge>,
    otherIdOf: (edge: GraphEdge) => string,
  ): ReadonlyArray<readonly [string, number]> =>
    [...group]
      .sort((a, b) => yOf(otherIdOf(a)) - yOf(otherIdOf(b)))
      .map((edge, index, sorted) => [
        edgeKey(edge),
        sorted.length === 1 ? 0 : (index / (sorted.length - 1) - 0.5) * PORT_SPREAD,
      ])

  const byFrom = Array.groupBy(graph.edges, edge => edge.from)
  const byTo = Array.groupBy(graph.edges, edge => edge.to)

  const fromOffsets = new Map(
    Object.values(byFrom).flatMap(group => spreadOffsets(group, edge => edge.to)),
  )
  const toOffsets = new Map(
    Object.values(byTo).flatMap(group => spreadOffsets(group, edge => edge.from)),
  )

  return new Map(
    graph.edges.map(edge => [
      edgeKey(edge),
      {
        fromOffset: fromOffsets.get(edgeKey(edge)) ?? 0,
        toOffset: toOffsets.get(edgeKey(edge)) ?? 0,
      },
    ]),
  )
}

// The layered layout always places an edge's source in an earlier column
// than its target (see layout.ts's assignLayers), so the connection always
// runs from the source's right edge to the target's left edge — offset by
// that edge's assigned port so edges sharing a node fan out instead of
// converging on the same point.
const edgeEndpoints = (
  fromPosition: NodePosition,
  toPosition: NodePosition,
  offsets: PortOffsets,
): { readonly from: { x: number; y: number }; readonly to: { x: number; y: number } } => ({
  from: {
    x: fromPosition.x + NODE_WIDTH,
    y: fromPosition.y + NODE_HEIGHT / 2 + offsets.fromOffset,
  },
  to: {
    x: toPosition.x,
    y: toPosition.y + NODE_HEIGHT / 2 + offsets.toOffset,
  },
})

const nodeView = (
  node: GraphNode,
  position: NodePosition,
  highlight: NodeHighlight,
  h: HtmlBuilder<Message>,
): Html =>
  h.g(
    [
      h.Id(node.id),
      h.Transform(`translate(${position.x}, ${position.y})`),
      h.OnClick(ClickedNode({ id: node.id })),
      h.Class(
        highlight === 'neighbor' ? 'cursor-pointer node-neighbor' : 'cursor-pointer',
      ),
      h.Opacity(NODE_OPACITY[highlight]),
    ],
    [
      // Neck: a flask reads as a flask because of the narrow neck sitting
      // on a wider body, so these three shapes (stopper, neck, body) go
      // from top to bottom before any text or highlight is drawn.
      h.rect(
        [
          h.X(String(NODE_WIDTH / 2 - 16)),
          h.Y('-20'),
          h.Width('32'),
          h.Height('8'),
          h.Rx('3'),
          h.Fill('#78350f'),
        ],
        [],
      ),
      h.rect(
        [
          h.X(String(NODE_WIDTH / 2 - 12)),
          h.Y('-16'),
          h.Width('24'),
          h.Height('20'),
          h.Fill(`url(#${flaskPaletteFor(node.resourceType).gradientId})`),
        ],
        [],
      ),
      h.rect(
        [
          h.Width(String(NODE_WIDTH)),
          h.Height(String(NODE_HEIGHT)),
          h.Rx('20'),
          h.Fill(`url(#${flaskPaletteFor(node.resourceType).gradientId})`),
          h.Stroke(NODE_STROKE[highlight]),
          h.StrokeWidth('3'),
        ],
        [],
      ),
      // Glass highlight: a soft white ellipse near the top-left suggests a
      // curved, reflective surface rather than a flat fill.
      h.ellipse(
        [
          h.Cx('54'),
          h.Cy('16'),
          h.Rx('26'),
          h.Ry('10'),
          h.Fill('white'),
          h.Opacity('0.3'),
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
  highlight: EdgeHighlight,
  portOffsets: ReadonlyMap<string, PortOffsets>,
  h: HtmlBuilder<Message>,
): Html =>
  pipe(
    Option.all([findPosition(positions, edge.from), findPosition(positions, edge.to)]),
    Option.map(([fromPosition, toPosition]) => {
      const offsets = portOffsets.get(edgeKey(edge)) ?? { fromOffset: 0, toOffset: 0 }
      const { from, to } = edgeEndpoints(fromPosition, toPosition, offsets)
      const midX = (from.x + to.x) / 2
      const midY = (from.y + to.y) / 2

      return h.g(
        [
          h.Class(highlight === 'touching' ? 'edge-highlighted' : ''),
          h.Opacity(EDGE_OPACITY[highlight]),
        ],
        [
          h.line(
            [
              h.X1(String(from.x)),
              h.Y1(String(from.y)),
              h.X2(String(to.x)),
              h.Y2(String(to.y)),
              h.Stroke(EDGE_STROKE[highlight]),
              h.StrokeWidth(EDGE_WIDTH[highlight]),
              h.MarkerEnd(EDGE_MARKER[highlight]),
            ],
            [],
          ),
          // A droplet riding the edge like liquid moving through tubing
          // between two flasks — the piece that sells "distillation" rather
          // than "dependency graph".
          h.circle(
            [h.R(BUBBLE_RADIUS[highlight]), h.Fill(EDGE_STROKE[highlight])],
            [
              h.animateMotion(
                [
                  h.Attribute('path', `M ${from.x} ${from.y} L ${to.x} ${to.y}`),
                  h.Attribute('dur', BUBBLE_DURATION[highlight]),
                  h.Attribute('begin', bubbleBeginOffset(edge, BUBBLE_DURATION[highlight])),
                  h.Attribute('repeatCount', 'indefinite'),
                ],
                [],
              ),
            ],
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
          ['Click a node to see its details'],
        ),
      onSome: node =>
        h.p(
          [h.Class('text-sm text-stone-900')],
          [`Selected: ${node.id} (${node.resourceType})`],
        ),
    }),
  )

export const view = (model: Model, h: HtmlBuilder<Message>): Document => {
  const positions = layoutNodes(model.graph)
  const width = svgWidth(positions)
  const height = svgHeight(positions)
  const portOffsets = buildPortOffsets(model.graph, positions)
  const neighbors = pipe(
    model.selectedNodeId,
    Option.map(id => neighborsOf(model.graph.edges, id)),
    Option.getOrElse((): ReadonlySet<string> => new Set()),
  )

  return {
    title: 'retort — the infra serving this page',
    body: h.div(
      [h.Class('min-h-screen bg-stone-100 p-8 text-stone-900')],
      [
        h.h1(
          [h.Class('mb-1 font-serif text-2xl')],
          ['The infra serving this page'],
        ),
        h.p(
          [h.Class('mb-4 text-sm text-stone-500')],
          [
            "You're looking at a live diagram of the infrastructure that's rendering it right now",
          ],
        ),
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
                ...FLASK_PALETTES.map(palette =>
                  h.linearGradient(
                    [h.Id(palette.gradientId), h.X1('0'), h.Y1('0'), h.X2('0'), h.Y2('1')],
                    [
                      h.stop([h.Offset('0'), h.StopColor(palette.top)], []),
                      h.stop([h.Offset('1'), h.StopColor(palette.bottom)], []),
                    ],
                  ),
                ),
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
                h.marker(
                  [
                    h.Id('edge-arrowhead-highlight'),
                    h.ViewBox('0 0 10 10'),
                    h.RefX('9'),
                    h.RefY('5'),
                    h.MarkerWidth('7'),
                    h.MarkerHeight('7'),
                    h.Orient('auto-start-reverse'),
                  ],
                  [h.path([h.D('M 0 0 L 10 5 L 0 10 z'), h.Fill('#f59e0b')], [])],
                ),
              ],
            ),
            h.g(
              [h.Transform(`translate(${CANVAS_PADDING}, ${CANVAS_PADDING})`)],
              [
                ...Array.map(model.graph.edges, edge =>
                  edgeView(
                    edge,
                    positions,
                    edgeHighlightOf(model.selectedNodeId, edge),
                    portOffsets,
                    h,
                  ),
                ),
                ...Array.map(model.graph.nodes, node =>
                  pipe(
                    findPosition(positions, node.id),
                    Option.map(position =>
                      nodeView(
                        node,
                        position,
                        nodeHighlightOf(model.selectedNodeId, neighbors, node.id),
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
