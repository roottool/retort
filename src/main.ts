import { Option, Schema as S, pipe } from 'effect'
import type { Command, Runtime } from 'foldkit'
import { m } from 'foldkit/message'
import { evo } from 'foldkit/struct'

import { dummyGraph } from './dummyGraph'
import { Graph } from './schema'

// MODEL

export const Model = S.Struct({
  graph: Graph,
  selectedNodeId: S.Option(S.String),
})
export type Model = typeof Model.Type

// MESSAGE

export const ClickedNode = m('ClickedNode', { id: S.String })

export const Message = S.Union([ClickedNode])
export type Message = typeof Message.Type

// INIT

const makeInitialModel = (graph: Graph): Model =>
  Model.make({ graph, selectedNodeId: Option.none() })

// テスト(story/scene)は常にダミーデータで決定的に動くよう、これは
// graph.generated.json の有無に左右されない固定値にする。
export const initialModel = makeInitialModel(dummyGraph)

// `bun run parse-alchemy` の出力(scripts/parse-alchemy.ts参照)が存在すれば
// 実行時にそれを使い、なければダミーデータにフォールバックする。
// import.meta.glob はファイルが無くてもビルドエラーにならないため、
// `.alchemy/deploy`未実行のクローン直後でもアプリが動く。
const generatedGraphModules = import.meta.glob<{ default: unknown }>(
  './graph.generated.json',
  { eager: true },
)

const resolveGraph = (): Graph =>
  pipe(
    Option.fromNullishOr(generatedGraphModules['./graph.generated.json']),
    Option.map(generatedModule => generatedModule.default),
    Option.flatMap(data => S.decodeUnknownOption(Graph)(data)),
    Option.getOrElse(() => dummyGraph),
  )

export const init: Runtime.ApplicationInit<Model, Message> = () => [
  makeInitialModel(resolveGraph()),
  [],
]

// UPDATE

type UpdateReturn = readonly [Model, ReadonlyArray<Command.Command<Message>>]

export const update = (model: Model, message: Message): UpdateReturn => [
  evo(model, { selectedNodeId: () => Option.some(message.id) }),
  [],
]
