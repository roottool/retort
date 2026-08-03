import { existsSync } from 'node:fs'
import { basename } from 'node:path'

import { Schema as S } from 'effect'

import { Graph } from '../src/schema'

const STATE_ROOT = '.alchemy/state'
const STACK_OUTPUT_BASENAME = '__stack_output__.json'
const OUTPUT_PATH = 'src/graph.generated.json'

// Only validates the parts of an .alchemy/ state file needed to extract the
// graph. Extra properties like attr/props are silently ignored by S.Struct,
// so they aren't picked up here.
const AlchemyBindingDetail = S.Struct({
  type: S.String,
})

const AlchemyBinding = S.Struct({
  sid: S.String,
  data: S.Struct({
    bindings: S.Array(AlchemyBindingDetail),
  }),
})

const AlchemyResourceState = S.Struct({
  logicalId: S.String,
  resourceType: S.String,
  bindings: S.Array(AlchemyBinding),
})

const findStateFilePaths = async (
  stateRoot: string,
): Promise<ReadonlyArray<string>> => {
  const glob = new Bun.Glob('**/*.json')
  const paths: Array<string> = []
  for await (const path of glob.scan({ cwd: stateRoot, absolute: true })) {
    if (basename(path) !== STACK_OUTPUT_BASENAME) {
      paths.push(path)
    }
  }
  return paths
}

const readResourceState = async (
  path: string,
): Promise<typeof AlchemyResourceState.Type> => {
  const content: unknown = await Bun.file(path).json()
  try {
    return S.decodeUnknownSync(AlchemyResourceState)(content)
  } catch (cause) {
    throw new Error(`Failed to parse Alchemy state file: ${path}`, { cause })
  }
}

const main = async (): Promise<void> => {
  if (!existsSync(STATE_ROOT)) {
    console.error(
      `${STATE_ROOT} が見つかりません。先に \`bun alchemy deploy\` を実行してください。`,
    )
    process.exit(1)
  }

  const filePaths = await findStateFilePaths(STATE_ROOT)
  const resources = await Promise.all(filePaths.map(readResourceState))

  const nodes = resources.map(resource => ({
    id: resource.logicalId,
    resourceType: resource.resourceType,
  }))

  const edges = resources.flatMap(resource =>
    resource.bindings.flatMap(binding =>
      binding.data.bindings.map(detail => ({
        from: resource.logicalId,
        to: binding.sid,
        bindingType: detail.type,
      })),
    ),
  )

  const graph = S.decodeUnknownSync(Graph)({ nodes, edges })

  await Bun.write(OUTPUT_PATH, `${JSON.stringify(graph, null, 2)}\n`)
  console.log(
    `${OUTPUT_PATH} に ${graph.nodes.length} ノード、${graph.edges.length} エッジを書き出しました。`,
  )
}

await main()
