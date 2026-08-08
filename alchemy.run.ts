import * as Alchemy from 'alchemy'
import * as Cloudflare from 'alchemy/Cloudflare'
import * as State from 'alchemy/State'
import * as Effect from 'effect/Effect'

export default Alchemy.Stack(
	'MyApp',
	{
		providers: Cloudflare.providers(),
		state: State.localState(),
	},
	Effect.gen(function* () {
		const kv = yield* Cloudflare.KV.Namespace('Sessions')
		const db = yield* Cloudflare.D1.Database('Db')
		const auth = yield* Cloudflare.Worker('Auth', {
			main: './src/authWorker.ts',
			env: { Db: db },
		})
		const worker = yield* Cloudflare.Worker('Api', {
			main: './src/worker.ts',
			env: { Sessions: kv, Db: db, Auth: auth },
			// Serves this project's own built viewer (`bun run build`), so the
			// deployed stack's dependency graph includes the very Worker
			// rendering it.
			assets: './dist',
		})
		return {
			workerUrl: worker.url,
		}
	}),
)
