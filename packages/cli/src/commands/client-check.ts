import { readFile } from "node:fs/promises";
import { canonicalJson, type JsonValue } from "@relkit/contracts";
import { CLI_EXIT_CODES, fail, type CliCommandContext } from "../main-support.js";
import type { ContractDocument } from "./client.js";

export async function checkClientContract(
  remote: ContractDocument,
  directory: string,
  context: CliCommandContext,
  validate: (document: ContractDocument) => unknown,
): Promise<number> {
  let local: ContractDocument;
  try {
    local = JSON.parse(
      await readFile(`${directory}/client-contract.json`, "utf8"),
    ) as ContractDocument;
  } catch {
    throw fail("RELKIT_CLIENT_CONTRACT_MISSING", `No client contract exists in ${directory}`);
  }
  validate(local);
  if (local.publicFingerprint !== remote.publicFingerprint) {
    throw fail(
      "RELKIT_CLIENT_CONTRACT_DRIFT",
      "Generated client is stale; run `relkit client pull` before building the frontend",
    );
  }
  context.reporter.output(
    { directory, publicFingerprint: remote.publicFingerprint },
    `Client contract ${remote.publicFingerprint} is current`,
  );
  return CLI_EXIT_CODES.success;
}

export function clientManifest(document: ContractDocument): string {
  return `${canonicalJson({
    protocol: "relkit.client-manifest",
    version: document.version,
    publicFingerprint: document.publicFingerprint,
    routes: document.routes ?? [],
    channels: document.channels ?? [],
    agents: document.agents ?? [],
  } as JsonValue)}\n`;
}
