/** Projects activated manifest documentation selection into truthful development ready links. */
import { join } from "node:path";
import { Effect, Schema } from "effect";
import type { LoadedToolingConfig } from "@relkit/compiler";
import { CliFileSystem } from "../services/filesystem.service.js";
import type { DevLog } from "./dev.js";

const ReadyManifest = Schema.fromJsonString(
  Schema.Struct({
    server: Schema.Struct({
      apiDocs: Schema.Struct({ ui: Schema.optionalKey(Schema.Literals(["scalar", false])) }),
    }),
  }),
);

/** Reads existing activated metadata for presentation; unavailable metadata grants no optional UI link. */
export const logDevReadyEffect = Effect.fn("Dev.readyLinks")(function* (
  log: DevLog,
  hostname: string,
  backendPort: number,
  directory?: string,
) {
  const files = yield* CliFileSystem;
  const docs =
    directory === undefined
      ? undefined
      : yield* files.readText(join(directory, "manifest.json")).pipe(
          Effect.flatMap(Schema.decodeUnknownEffect(ReadyManifest)),
          Effect.map((manifest) => manifest.server.apiDocs),
          Effect.catch(() =>
            Effect.sync(() => {
              log({ level: "debug", event: "dev.ready.metadata-unavailable" });
              return undefined;
            }),
          ),
        );
  logDevReady(log, hostname, backendPort, undefined, docs);
});

/**
 * Emits the established ready links after activation succeeds.
 * @param log - Borrowed admitted-log edge.
 * @param hostname - Stable proxy hostname.
 * @param backendPort - Stable listener port.
 * @param inspectorPort - Optional separate inspector listener.
 * @param apiDocs - Documentation selection decoded from the activated canonical manifest.
 * @returns No value; only the existing ready event is presented.
 */
export function logDevReady(
  log: DevLog,
  hostname: string,
  backendPort: number,
  inspectorPort?: number,
  apiDocs?: Pick<LoadedToolingConfig["server"]["apiDocs"], "ui">,
): void {
  const backend = `http://${hostname}:${backendPort}`;
  log({
    level: "info",
    event: "dev.ready",
    fields: {
      backend,
      openapi: `${backend}/_relkit/v1/openapi.json`,
      ...(apiDocs?.ui === "scalar" ? { apiReference: `${backend}/_relkit/v1/api-reference` } : {}),
      ...(inspectorPort === undefined ? {} : { inspector: `http://127.0.0.1:${inspectorPort}` }),
    },
  });
}
