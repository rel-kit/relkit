import { Config, Context, Effect, Layer, Option, Redacted } from "effect";
import { canonicalJson } from "@relkit/contracts";
import {
  agentProcedureEntriesFromDocument,
  generateContractFromDocument,
  jobProcedureSourcesFromDocument,
} from "@relkit/client-generator";
import {
  cliAdapterError,
  cliTry,
  cliValidation,
  type CliAdapterError,
  type CliFailureError,
} from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import { fail } from "../main-support.js";
import { clientManifest, checkClientContractEffect } from "../commands/client-check.js";
import { decodeClientDocument, validateClientDocument } from "../commands/client-document.js";
import { CliHttp, httpLayer } from "./http.service.js";
import { CliFileSystem, fileSystemLayer } from "./filesystem.service.js";
import { CliCompiler, compilerLayer } from "./compiler.service.js";
import type { ClientCapabilities, ClientSettingsCapabilities } from "./client.types.js";

const MAX_CONTRACT_BYTES = 4 * 1024 * 1024;

/** Client-only configuration, acquired separately from unrelated jobs/dev settings. */
export class CliClientSettings extends Context.Service<
  CliClientSettings,
  ClientSettingsCapabilities
>()("relkit/cli/ClientSettings") {}
/** Reads the client pull token once through Effect's redacted configuration boundary. */
export const clientSettingsLayer = Layer.effect(
  CliClientSettings,
  Effect.gen(function* () {
    return CliClientSettings.of({
      token: yield* Config.option(Config.Redacted("RELKIT_CLIENT_PULL_TOKEN")).pipe(
        Effect.mapError((error) => cliAdapterError("client.settings", error)),
      ),
    });
  }),
);

/** Contract pull/check domain, with all required authority captured at Layer acquisition. */
export class CliClient extends Context.Service<CliClient, ClientCapabilities>()(
  "relkit/cli/Client",
) {}

/**
 * Acquires client workflows from explicit HTTP, filesystem, compiler, and token capabilities.
 * @returns A domain Layer whose public methods have no hidden service requirements.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * const result = await Effect.runPromise(Effect.gen(function* () {
 *   const client = yield* CliClient;
 *   return yield* client.check("http://localhost:3000/", "./generated");
 * }).pipe(Effect.provide(clientLiveLayer)));
 * ```
 */
export const clientLayer = Layer.effect(
  CliClient,
  Effect.gen(function* () {
    const http = yield* CliHttp;
    const files = yield* CliFileSystem;
    const compiler = yield* CliCompiler;
    const settings = yield* CliClientSettings;
    const download = Effect.fn("CliClient.download")(function* (baseUrl: string) {
      const url = new URL(baseUrl);
      if (!url.pathname.endsWith("/")) url.pathname += "/";
      const headers = new Headers();
      if (Option.isSome(settings.token) && Redacted.value(settings.token.value) !== "")
        headers.set("authorization", `Bearer ${Redacted.value(settings.token.value)}`);
      const response = yield* http.request(new URL("_relkit/v1/client-contract.json", url), {
        headers,
      });
      if (!response.ok)
        return yield* Effect.fail(
          fail("RELKIT_CLIENT_PULL_FAILED", `Client contract returned HTTP ${response.status}`),
        );
      const value = yield* http
        .json(response, MAX_CONTRACT_BYTES)
        .pipe(
          Effect.catchTag(
            "CliAdapterError",
            (error): Effect.Effect<never, CliAdapterError | CliFailureError> =>
              error.operation === "http.limit"
                ? Effect.fail(
                    fail(
                      "RELKIT_CLIENT_CONTRACT_TOO_LARGE",
                      "Client contract exceeds the download limit",
                    ),
                  )
                : error.operation === "http.json"
                  ? Effect.fail(
                      fail("RELKIT_CLIENT_CONTRACT_INVALID", "Client contract is not valid JSON"),
                    )
                  : Effect.fail(error),
          ),
        );
      return yield* cliValidation(() => decodeClientDocument(value));
    });
    return CliClient.of({
      pull: Effect.fn("CliClient.pull")(
        function* (baseUrl: string, directory: string) {
          const document = yield* download(baseUrl);
          const { procedures, registry } = yield* cliValidation(() =>
            validateClientDocument(document),
          );
          const contract = yield* cliTry("client.generate", () =>
            generateContractFromDocument(
              procedures,
              agentProcedureEntriesFromDocument(document.agents),
              jobProcedureSourcesFromDocument(document.jobs),
            ),
          );
          const outputs: ReadonlyArray<readonly [string, string]> = [
            ["client-contract.json", `${canonicalJson(document)}\n`],
            ["contract.ts", contract],
            [
              "client.ts",
              'export { createClient, ORPCError } from "@relkit/client";\nexport { contract } from "./contract.js";\n',
            ],
            ["client-registry.d.ts", registry],
            ["client-manifest.json", clientManifest(document)],
          ];
          yield* files.mkdir(directory);
          const writes = yield* Effect.forEach(
            outputs,
            ([name, text]) => compiler.writeChanged(`${directory}/${name}`, text),
            { concurrency: 4 },
          );
          return {
            directory,
            graphHash: document.graphHash,
            files: writes.map((entry) => entry.fileName).sort(),
          };
        },
        (effect, _baseUrl: string, _directory: string) =>
          observeCli("client.pull", effect.pipe(Effect.scoped), () => ({ files: 5 })),
      ),
      check: Effect.fn("CliClient.check")(
        function* (baseUrl: string, directory: string) {
          const document = yield* download(baseUrl);
          yield* cliValidation(() => validateClientDocument(document));
          return yield* checkClientContractEffect(document, directory, validateClientDocument).pipe(
            Effect.provideService(CliFileSystem, files),
          );
        },
        (effect, _baseUrl: string, _directory: string) =>
          observeCli("client.check", effect.pipe(Effect.scoped)),
      ),
    });
  }),
);

/** Invocation graph for public client compatibility edges; configuration is read only on acquisition. */
export const clientLiveLayer = clientLayer.pipe(
  Layer.provide(Layer.mergeAll(httpLayer, fileSystemLayer, compilerLayer, clientSettingsLayer)),
);
