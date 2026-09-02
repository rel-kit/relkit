import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import {
  generateContractFromDocument,
  type ContractProcedureDocument,
} from "@relkit/client-generator";
import { CONTRACT_VERSION, canonicalJson, type JsonValue } from "@relkit/contracts";
import { writeIfChanged } from "@relkit/compiler";
import { CLI_EXIT_CODES, fail, type CliCommandContext } from "../main-support.js";

const MAX_CONTRACT_BYTES = 4 * 1_024 * 1_024;

export async function runClient(
  args: readonly string[],
  context: CliCommandContext,
): Promise<number> {
  if (args[0] !== "pull")
    throw fail("RELKIT_CLIENT_USAGE", "Usage: relkit client pull <baseUrl> --out <directory>", 2);
  const options = parse(args.slice(1));
  const document = await download(options.baseUrl, context.signal);
  const procedures = validate(document);
  const directory = resolve(options.out);
  await mkdir(directory, { recursive: true });
  const writes = await Promise.all([
    writeIfChanged(
      `${directory}/client-contract.json`,
      `${canonicalJson(document as unknown as JsonValue)}\n`,
    ),
    writeIfChanged(`${directory}/contract.ts`, generateContractFromDocument(procedures)),
    writeIfChanged(
      `${directory}/client.ts`,
      'export { createClient, ORPCError } from "@relkit/client";\nexport { contract } from "./contract.js";\n',
    ),
  ]);
  const result = {
    directory,
    graphHash: document.graphHash,
    files: writes.map((entry) => entry.fileName).sort(),
  };
  context.reporter.output(result, `Pulled client contract ${document.graphHash} to ${directory}`);
  return CLI_EXIT_CODES.success;
}

function parse(args: readonly string[]): { readonly baseUrl: string; readonly out: string } {
  const baseUrl = args[0];
  let out: string | undefined;
  for (let index = 1; index < args.length; index += 1) {
    if (args[index] !== "--out" || args[index + 1] === undefined) {
      throw fail("RELKIT_CLIENT_USAGE", `Unknown client pull option: ${args[index]}`, 2);
    }
    out = args[++index];
  }
  if (baseUrl === undefined || out === undefined) {
    throw fail("RELKIT_CLIENT_USAGE", "Usage: relkit client pull <baseUrl> --out <directory>", 2);
  }
  const url = new URL(baseUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw fail("RELKIT_CLIENT_URL_INVALID", "Client pull requires an HTTP(S) base URL", 2);
  }
  return { baseUrl: url.toString(), out };
}

async function download(baseUrl: string, signal: AbortSignal): Promise<ContractDocument> {
  const url = new URL("_relkit/v1/client-contract.json", ensureSlash(new URL(baseUrl)));
  const headers = new Headers();
  if (process.env.RELKIT_CLIENT_PULL_TOKEN) {
    headers.set("authorization", `Bearer ${process.env.RELKIT_CLIENT_PULL_TOKEN}`);
  }
  const response = await fetch(url, { headers, signal });
  if (!response.ok)
    throw fail("RELKIT_CLIENT_PULL_FAILED", `Client contract returned HTTP ${response.status}`);
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_CONTRACT_BYTES) {
    throw fail("RELKIT_CLIENT_CONTRACT_TOO_LARGE", "Client contract exceeds the download limit");
  }
  const bytes = await boundedBytes(response);
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as ContractDocument;
  } catch {
    throw fail("RELKIT_CLIENT_CONTRACT_INVALID", "Client contract is not valid JSON");
  }
}

async function boundedBytes(response: Response): Promise<Uint8Array> {
  if (response.body === null) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    size += next.value.byteLength;
    if (size > MAX_CONTRACT_BYTES) {
      await reader.cancel();
      throw fail("RELKIT_CLIENT_CONTRACT_TOO_LARGE", "Client contract exceeds the download limit");
    }
    chunks.push(next.value);
  }
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

interface ContractDocument {
  readonly protocol: string;
  readonly version: number;
  readonly graphHash: string;
  readonly procedures: readonly unknown[];
}

function validate(document: ContractDocument): ContractProcedureDocument[] {
  if (document.protocol !== "relkit.client-contract")
    throw fail(
      "RELKIT_CLIENT_PROTOCOL_UNSUPPORTED",
      `Client contract protocol ${JSON.stringify(document.protocol)} is unsupported`,
    );
  if (document.version !== CONTRACT_VERSION) {
    throw fail(
      "RELKIT_CLIENT_PROTOCOL_UNSUPPORTED",
      `Client contract version ${String(document.version)} is unsupported; expected ${CONTRACT_VERSION}. Regenerate the server with \`relkit build\``,
    );
  }
  if (!/^sha256:[a-f0-9]{64}$/.test(document.graphHash) || !Array.isArray(document.procedures)) {
    throw fail("RELKIT_CLIENT_CONTRACT_INVALID", "Client contract hash or procedures are invalid");
  }
  return document.procedures.map((value) => {
    if (!isRecord(value) || typeof value.name !== "string" || !Array.isArray(value.errors)) {
      throw fail("RELKIT_CLIENT_CONTRACT_INVALID", "Client contract procedure is invalid");
    }
    const errors = value.errors.map((error) => {
      if (!isRecord(error) || typeof error.id !== "string") {
        throw fail("RELKIT_CLIENT_CONTRACT_INVALID", "Client contract error is invalid");
      }
      return { id: error.id, schema: error.schema };
    });
    return { name: value.name, input: value.input, output: value.output, errors };
  });
}

function ensureSlash(url: URL): URL {
  return url.pathname.endsWith("/") ? url : new URL(`${url.pathname}/`, url);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
