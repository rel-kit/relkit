import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  API_BASE_PATH,
  API_VERSION,
  GENERATOR_VERSION,
  GRAPH_VERSION,
  MANIFEST_VERSION,
} from "@zsys/contracts";
import { startDev, type DevOptions } from "./src/commands/dev.js";

export type CandidateFailure = "compile" | "start" | "hash" | "api" | "readiness";
export type DevSession = Awaited<ReturnType<typeof startDev>>;

export function baseOptions(root: string): Omit<DevOptions, "compile"> {
  return {
    projectRoot: root,
    stablePort: 0,
    installSignalHandlers: false,
    inspector: false,
    logger: { human: false, json: false },
  };
}

export async function makeRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "zsys-dev-13-13-"));
}

export async function startTrafficSession(root: string, marker: string): Promise<DevSession> {
  const graphHash = "sha256:traffic";
  return startDev({
    ...baseOptions(root),
    graphHash,
    drainTimeoutMs: 250,
    candidateStopTimeoutMs: 50,
    environment: { ZSYS_HOLD_MARKER: marker },
    compile: async ({ outputDirectory, token }) => {
      const entrypoint = join(outputDirectory, "server.ts");
      await writeFile(
        entrypoint,
        candidateSource({
          generation: token.generationToken,
          graphHash,
          hold: token.sourceToken === 1 ? "complete" : undefined,
        }),
      );
      return { entrypoint };
    },
  });
}

export function candidateSource(options: {
  readonly generation: number;
  readonly graphHash: string;
  readonly failure?: CandidateFailure;
  readonly hold?: "complete";
}): string {
  const apiVersion = options.failure === "api" ? API_VERSION + 1 : API_VERSION;
  const graphHash = options.failure === "hash" ? "sha256:wrong" : options.graphHash;
  const ready = options.failure === "readiness" ? false : true;
  const startFailure =
    options.failure === "start" ? 'throw new Error("candidate startup failed");' : "";
  return `${startFailure}
const generation = ${options.generation};
const graphHash = ${JSON.stringify(graphHash)};
const apiVersion = ${apiVersion};
Bun.serve({ port: Number(process.env.PORT), async fetch(request) {
  const path = new URL(request.url).pathname;
  if (path === "/hello") return new Response("generation-" + generation);
  if (path === "/hold") {
    if (process.env.ZSYS_HOLD_MARKER) await Bun.write(process.env.ZSYS_HOLD_MARKER, "started");
    ${options.hold === "complete" ? "await Bun.sleep(80);" : ""}
    return new Response("generation-" + generation);
  }
  const identity = { sourceToken: Number(process.env.ZSYS_SOURCE_TOKEN), generationToken: Number(process.env.ZSYS_GENERATION_TOKEN) };
  const headers = { "content-type": "application/json", "x-zsys-api-version": String(apiVersion) };
  if (path === "${API_BASE_PATH}/health/live") return Response.json({ protocol: "zsys.inspector", version: apiVersion, status: "ok", ...identity }, { headers });
  if (path === "${API_BASE_PATH}/graph") return Response.json({ protocol: "zsys.inspector", version: apiVersion, graphHash, manifestGraphHash: graphHash, graphContractVersion: ${GRAPH_VERSION}, manifestContractVersion: ${MANIFEST_VERSION}, manifestGeneratorVersion: ${GENERATOR_VERSION}, ...identity }, { headers });
  if (path === "${API_BASE_PATH}/health/ready") return Response.json({ protocol: "zsys.inspector", version: apiVersion, status: "ready", environmentReady: ${ready}, providerReady: true, ...identity }, { headers });
  return new Response("not found", { status: 404 });
}});`;
}

export async function responseText(session: DevSession, path: string): Promise<string> {
  return (await fetch(`http://127.0.0.1:${session.backendPort}${path}`)).text();
}

export async function waitForFile(path: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      await readFile(path, "utf8");
      return;
    } catch {
      await Bun.sleep(2);
    }
  }
  throw new Error(`Timed out waiting for ${path}`);
}

export async function waitForText(url: string, expected: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await (await fetch(url)).text()) === expected) return;
    } catch {
      // The stable proxy may still be waiting for its first active target.
    }
    await Bun.sleep(2);
  }
  throw new Error(`Timed out waiting for ${expected} from ${url}`);
}
