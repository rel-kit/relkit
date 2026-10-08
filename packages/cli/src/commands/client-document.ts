import { Schema } from "effect";
import { CONTRACT_VERSION } from "@relkit/contracts";
import {
  generateClientRegistryFromDocument,
  InvalidClientContract,
} from "@relkit/client-generator";
import { fail } from "../main-support.js";
import {
  clientDocumentSchema,
  clientEnvelopeSchema,
  clientErrorSchema,
  clientProcedureSchema,
} from "./client.schemas.js";
import type { ClientOptions, ContractDocument, ValidatedClientDocument } from "./client.types.js";

/**
 * Parses existing client options without reading the environment or fetching data.
 * @param args - Arguments after pull/check.
 * @returns Validated HTTP endpoint and output path.
 * @throws The established usage/URL errors for invalid arguments.
 */
export function parseClientOptions(args: readonly string[]): ClientOptions {
  const baseUrl = args[0];
  let out: string | undefined;
  for (let index = 1; index < args.length; index += 1) {
    if (args[index] !== "--out" || args[index + 1] === undefined)
      throw fail("RELKIT_CLIENT_USAGE", `Unknown client pull option: ${args[index]}`, 2);
    out = args[++index];
  }
  if (baseUrl === undefined || out === undefined)
    throw fail("RELKIT_CLIENT_USAGE", "Usage: relkit client pull <baseUrl> --out <directory>", 2);
  const url = new URL(baseUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw fail("RELKIT_CLIENT_URL_INVALID", "Client pull requires an HTTP(S) base URL", 2);
  return { baseUrl: url.toString(), out };
}

/**
 * Validates protocol/version before promoting untrusted JSON to a client document.
 * @param value - Remote or local JSON bytes decoded to unknown.
 * @returns A schema-validated portable document, preserving extra contract fields.
 * @throws The established protocol or invalid-contract error.
 */
export function decodeClientDocument(value: unknown): ContractDocument {
  const envelope = Schema.is(clientEnvelopeSchema)(value) ? value : {};
  if (envelope.protocol !== "relkit.client-contract")
    throw fail(
      "RELKIT_CLIENT_PROTOCOL_UNSUPPORTED",
      `Client contract protocol ${JSON.stringify(envelope.protocol)} is unsupported`,
    );
  if (envelope.version !== CONTRACT_VERSION)
    throw fail(
      "RELKIT_CLIENT_PROTOCOL_UNSUPPORTED",
      `Client contract version ${String(envelope.version)} is unsupported; expected ${CONTRACT_VERSION}. Regenerate the server with \`relkit build\``,
    );
  if (
    !Schema.is(clientDocumentSchema)(value) ||
    !/^sha256:[a-f0-9]{64}$/.test(value.graphHash) ||
    !/^sha256:[a-f0-9]{64}$/.test(value.publicFingerprint)
  )
    throw fail("RELKIT_CLIENT_CONTRACT_INVALID", "Client contract hash or procedures are invalid");
  return value;
}

/**
 * Validates nested procedure/agent metadata before invoking the existing generators.
 * @param document - Accepted versioned document.
 * @returns Generator inputs and registry bytes.
 * @throws Established client-contract errors; unrelated generator defects escape.
 */
export function validateClientDocument(document: ContractDocument): ValidatedClientDocument {
  const procedures = document.procedures.map((value) => {
    if (!Schema.is(clientProcedureSchema)(value))
      throw fail("RELKIT_CLIENT_CONTRACT_INVALID", "Client contract procedure is invalid");
    const errors = value.errors.map((error) => {
      if (!Schema.is(clientErrorSchema)(error))
        throw fail("RELKIT_CLIENT_CONTRACT_INVALID", "Client contract error is invalid");
      return { id: error.id, schema: error.schema };
    });
    return { name: value.name, input: value.input, output: value.output, errors };
  });
  try {
    return { procedures, registry: generateClientRegistryFromDocument(document) };
  } catch (error) {
    if (error instanceof InvalidClientContract)
      throw fail(
        "RELKIT_CLIENT_CONTRACT_INVALID",
        `Invalid agent client metadata at ${error.path}`,
      );
    throw error;
  }
}
