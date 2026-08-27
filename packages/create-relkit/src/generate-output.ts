import { basename, relative, resolve } from "node:path";
import type { CreateOptions } from "./options.js";

export interface GenerateNextSteps {
  readonly commands: Readonly<{
    readonly cd: string;
    readonly dev: "bun run dev";
    readonly test: "bun run test";
    readonly check: "bun run check";
    readonly build: "bun run build";
  }>;
  readonly endpoints: Readonly<{
    readonly backend: "http://localhost:3000";
    readonly inspector: "http://localhost:3210";
    readonly openapi: "http://localhost:3000/_relkit/v1/openapi.json";
    readonly apiReference: "http://localhost:3000/_relkit/v1/api-reference";
    readonly route?: "GET http://localhost:3000/hello?name=RelKit";
  }>;
}

export function createGenerateNextSteps(
  options: Pick<CreateOptions, "examples">,
  destination: string,
  cwd = process.cwd(),
): GenerateNextSteps {
  const directory = relative(resolve(cwd), resolve(destination)) || basename(destination);
  const commands = Object.freeze({
    cd: `cd ${shellWord(directory)}`,
    dev: "bun run dev" as const,
    test: "bun run test" as const,
    check: "bun run check" as const,
    build: "bun run build" as const,
  });
  const endpoints = Object.freeze({
    backend: "http://localhost:3000" as const,
    inspector: "http://localhost:3210" as const,
    openapi: "http://localhost:3000/_relkit/v1/openapi.json" as const,
    apiReference: "http://localhost:3000/_relkit/v1/api-reference" as const,
    ...(options.examples ? { route: "GET http://localhost:3000/hello?name=RelKit" as const } : {}),
  });
  return Object.freeze({ commands, endpoints });
}

export function formatGenerateResult(value: unknown): string {
  if (!isRecord(value) || !isNextSteps(value.nextSteps)) return JSON.stringify(value);
  const { commands, endpoints } = value.nextSteps;
  return [
    ...(typeof value.name === "string" && typeof value.destination === "string"
      ? [`Success! Created ${value.name} at ${value.destination}.`, ""]
      : []),
    commands.cd,
    commands.dev,
    "",
    `backend:   ${endpoints.backend}`,
    `inspector: ${endpoints.inspector}`,
    `openapi:   ${endpoints.openapi}`,
    `api docs:  ${endpoints.apiReference}`,
    ...(endpoints.route === undefined ? [] : [`route:     ${endpoints.route}`]),
    "",
    commands.test,
    commands.check,
    commands.build,
  ].join("\n");
}

function shellWord(value: string): string {
  if (/^[A-Za-z0-9_./@-]+$/.test(value)) return value.startsWith("-") ? `./${value}` : value;
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function isNextSteps(value: unknown): value is GenerateNextSteps {
  if (!isRecord(value) || !isRecord(value.commands) || !isRecord(value.endpoints)) return false;
  const commands = value.commands;
  const endpoints = value.endpoints;
  return (
    typeof commands.cd === "string" &&
    commands.dev === "bun run dev" &&
    commands.test === "bun run test" &&
    commands.check === "bun run check" &&
    commands.build === "bun run build" &&
    endpoints.backend === "http://localhost:3000" &&
    endpoints.inspector === "http://localhost:3210" &&
    endpoints.openapi === "http://localhost:3000/_relkit/v1/openapi.json" &&
    endpoints.apiReference === "http://localhost:3000/_relkit/v1/api-reference" &&
    (endpoints.route === undefined ||
      endpoints.route === "GET http://localhost:3000/hello?name=RelKit")
  );
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
