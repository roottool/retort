import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as State from "alchemy/State";
import * as Effect from "effect/Effect";

export default Alchemy.Stack(
    "MyApp",
    {
        providers: Cloudflare.providers(),
        state: State.localState(),
    },
    Effect.gen(function* () {
        const bucket = yield* Cloudflare.R2.Bucket("Bucket");
        const kv = yield* Cloudflare.KV.Namespace("Sessions");
        const worker = yield* Cloudflare.Worker("Api", {
            main: "./src/worker.ts",
            env: { Bucket: bucket, Sessions: kv },
        });
        return {
            bucketName: bucket.bucketName,
            workerUrl: worker.url,
        };
    }),
);

