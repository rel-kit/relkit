import { Effect } from "effect";
import { canonicalJson } from "@relkit/contracts";
import { CLI_EXIT_CODES, fail, type CliCommandContext } from "../main-support.js";
import { cliTry, cliValidation } from "../cli-errors.js";
import { observeCli, runCliEffect } from "../cli-runtime.js";
import { CliFileSystem, fileSystemLayer } from "../services/filesystem.service.js";
import { decodeClientDocument } from "./client-document.js";
import type { ContractDocument } from "./client.types.js";

/**
 * Checks the locally generated contract against an accepted remote public fingerprint.
 * @param remote - Validated remote document.
 * @param directory - Existing generated-client directory.
 * @param validate - Existing caller's metadata validator, retained as a pure compatibility seam.
 * @returns Lazy fingerprint details or the established missing/invalid/drift failure.
 */
export const checkClientContractEffect = Effect.fn("Client.checkContract")(
  function* (
    remote: ContractDocument,
    directory: string,
    validate: (document: ContractDocument) => unknown,
  ) {
    const files = yield* CliFileSystem;
    const value: unknown = yield* files.readText(`${directory}/client-contract.json`).pipe(
      Effect.flatMap((text) => cliTry("client.localJson", () => JSON.parse(text))),
      Effect.catchTag("CliAdapterError", () =>
        Effect.fail(
          fail("RELKIT_CLIENT_CONTRACT_MISSING", `No client contract exists in ${directory}`),
        ),
      ),
    );
    const local = yield* cliValidation(() => decodeClientDocument(value));
    yield* cliValidation(() => validate(local));
    if (local.publicFingerprint !== remote.publicFingerprint)
      return yield* Effect.fail(
        fail(
          "RELKIT_CLIENT_CONTRACT_DRIFT",
          "Generated client is stale; run `relkit client pull` before building the frontend",
        ),
      );
    return { directory, publicFingerprint: remote.publicFingerprint };
  },
  (
    effect,
    _remote: ContractDocument,
    _directory: string,
    _validate: (document: ContractDocument) => unknown,
  ) => observeCli("client.checkContract", effect),
);

/**
 * Checks a local document at the established Promise/presentation boundary.
 * @param remote - Accepted remote document.
 * @param directory - Local contract directory.
 * @param context - Reporter and cancellation.
 * @param validate - Existing pure metadata validator.
 * @returns The established success status after emitting one report.
 */
export function checkClientContract(
  remote: ContractDocument,
  directory: string,
  context: CliCommandContext,
  validate: (document: ContractDocument) => unknown,
): Promise<number> {
  return runCliEffect(
    Effect.gen(function* () {
      const result = yield* checkClientContractEffect(remote, directory, validate);
      yield* Effect.sync(() =>
        context.reporter.output(result, `Client contract ${remote.publicFingerprint} is current`),
      );
      return CLI_EXIT_CODES.success;
    }),
    fileSystemLayer,
    context.signal,
  );
}

/**
 * Projects only portable public client metadata into canonical manifest bytes.
 * @param document - Validated client contract.
 * @returns Stable manifest bytes without server-private graph fields.
 */
export function clientManifest(document: ContractDocument): string {
  return `${canonicalJson({
    protocol: "relkit.client-manifest",
    version: document.version,
    publicFingerprint: document.publicFingerprint,
    ...(document.capabilities === undefined ? {} : { capabilities: document.capabilities }),
    routes: document.routes ?? [],
    channels: document.channels ?? [],
    agents: document.agents ?? [],
    ...(document.jobs === undefined ? {} : { jobs: document.jobs }),
    ...(document.nameToId === undefined ? {} : { nameToId: document.nameToId }),
  })}\n`;
}
