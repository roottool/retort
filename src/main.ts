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

// So tests (story/scene) always run deterministically against dummy data,
// this is a fixed value that doesn't depend on whether graph.generated.json
// exists.
export const initialModel = makeInitialModel(dummyGraph)

// If the output of `bun run parse-alchemy` (see scripts/parse-alchemy.ts)
// exists, use it at runtime; otherwise fall back to dummy data.
// import.meta.glob doesn't fail the build even when the file is missing, so
// the app still works right after a clone, before `.alchemy/deploy` has run.
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
