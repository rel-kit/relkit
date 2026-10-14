/** Classifies a bounded subset of shell operands without evaluating commands or expansions. */
import { posix } from "node:path";
import type { LayoutShellState, LayoutShellToken } from "./layout-shell.types.js";

const executables = new Set(["bun", "node", "tsx", "ts-node", "vitest", "tsc", "drizzle-kit"]);
const pathFlags = new Set([
  "--schema",
  "--config",
  "--file",
  "--input",
  "--output",
  "--path",
  "--project-root",
]);

/**
 * Retains quotes, comments and command separators as complete native tokens.
 * @param text - Original script or package command.
 * @returns Exact token offsets; quoted output is never evaluated.
 */
export function layoutShellTokens(text: string) {
  return text.matchAll(/"(?:\\.|[^"\\])*"|'[^']*'|#[^\n]*|&&|\|\||[;|\n]|[^\s;|&]+|&/g);
}

/**
 * Tracks explicit command/path positions and identifies known output payloads.
 * @param state - Invocation-local parser state.
 * @param raw - Original token including its quote delimiters.
 * @returns Ignored native syntax or an operand requiring path/manual classification.
 */
export function classifyLayoutShellToken(state: LayoutShellState, raw: string): LayoutShellToken {
  if (raw.startsWith("#")) return { kind: "ignored" };
  if (/^(?:&&|\|\||[;|\n&])$/.test(raw)) {
    state.command = undefined;
    state.previous = "";
    state.scriptSeen = false;
    return { kind: "ignored" };
  }
  const quoted = raw.startsWith('"') || raw.startsWith("'");
  const value = quoted ? raw.slice(1, -1) : raw;
  if (state.command === undefined && !value.includes("=")) {
    state.command = posix.basename(value);
    state.scriptSeen = false;
    return { kind: "ignored" };
  }
  if (state.command === "echo" || state.command === "printf") return { kind: "ignored" };
  const flag = value.split("=", 1)[0] ?? "";
  const supported =
    state.command !== undefined &&
    executables.has(state.command) &&
    (pathFlags.has(state.previous) ||
      (value.includes("=") && pathFlags.has(flag)) ||
      (!state.scriptSeen && !value.startsWith("-") && !["run", "test", "build"].includes(value)) ||
      (["vitest", "tsc"].includes(state.command) && !value.startsWith("-")));
  if (!value.startsWith("-") && !["run", "test", "build"].includes(value)) state.scriptSeen = true;
  state.previous = value;
  return { kind: "operand", value, quoted, supported };
}
