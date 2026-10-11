/**
 * Renders local onboarding from the generated project's actual installation state.
 * Pure command construction exposes finite preparation after skipped installation;
 * schema guards recognize presentation values without promoting arbitrary output
 * into the generated-result contract. Formatting performs no runtime acquisition.
 */
import { basename, relative, resolve } from "node:path";
import { Schema } from "effect";
import { GeneratePresentation } from "./generate-output.schemas.js";

import type { CreateOptions } from "./options.js";

/**
 * Builds local commands and endpoints for a generated project.
 * @param options - Installation and examples flags.
 * @param destination - Generated project's absolute destination path.
 * @param cwd - Working directory for the operation.
 * @returns Frozen commands and endpoints reflecting installation and example choices.
 */
export function createGenerateNextSteps(
  options: Pick<CreateOptions, "examples" | "install">,
  destination: string,
  cwd = process.cwd(),
): GenerateNextSteps {
  const directory = relative(resolve(cwd), resolve(destination)) || basename(destination);
  const commands = Object.freeze({
    cd: `cd ${shellWord(directory)}`,
    ...(options.install
      ? {}
      : {
          install: "bun install" as const,
          prepare: "bunx --no-install relkit dev --prepare" as const,
        }),
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

/**
 * Formats a recognizable generation result for terminal display.
 * @typeParam T - Native presentation input narrowed by the generated-result schema.
 * @param value - Generation result or an unrecognized output value.
 * @returns Success details, commands, endpoints and warnings; other values use JSON serialization.
 */
export function formatGenerateResult<T>(value: T): string {
  if (!Schema.is(GeneratePresentation)(value)) return JSON.stringify(value);
  const { commands, endpoints } = value.nextSteps;
  const additions = value.additions?.length ?? 0;
  const warnings = value.warnings?.map((warning) => warning.message) ?? [];
  return [
    ...(typeof value.name === "string" && typeof value.destination === "string"
      ? [`Success! Created ${value.name} at ${value.destination}.`, ""]
      : []),
    ...(additions ? [`additions: ${additions}`, ""] : []),
    commands.cd,
    ...(commands.install ? [commands.install] : []),
    ...(commands.prepare ? [commands.prepare] : []),
    commands.dev,
    "",
    `backend:   ${endpoints.backend}`,
    `inspector: ${endpoints.inspector}`,
    `openapi:   ${endpoints.openapi}`,
    `api docs:  ${endpoints.apiReference}`,
    ...(endpoints.route === undefined ? [] : [`route:     ${endpoints.route}`]),
    ...(warnings.length ? ["", ...warnings.map((warning) => `warning:   ${warning}`)] : []),
    "",
    commands.test,
    commands.check,
    commands.build,
  ].join("\n");
}

/**
 * Quotes a generated directory as one safe shell argument.
 * @param value - Directory path placed in the displayed cd command.
 * @returns The literal safe word or a single-quoted word with escaped apostrophes.
 */
function shellWord(value: string): string {
  if (/^[A-Za-z0-9_./@-]+$/.test(value)) return value.startsWith("-") ? `./${value}` : value;
  return `'${value.replaceAll("'", "'\\''")}'`;
}

import type { GenerateNextSteps } from "./generate-output.types.js";
export type { GenerateNextSteps } from "./generate-output.types.js";
