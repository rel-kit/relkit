import { spinner } from "@clack/prompts";
import type { CliRuntime } from "./main-support.js";

export function createCliStatus(runtime: CliRuntime, json: boolean, command: string) {
  const enabled =
    !json &&
    command !== "create" &&
    command !== "add" &&
    command !== "dev" &&
    command !== "start" &&
    runtime.io === undefined &&
    !(runtime.ci ?? Boolean(process.env.CI)) &&
    (runtime.tty ?? process.stderr.isTTY) === true;
  const value = enabled ? spinner() : undefined;
  return {
    start: () => value?.start(`relkit ${command}`),
    message: (message: string) => value?.message(message),
    finish: (ok: boolean) =>
      ok ? value?.stop(`relkit ${command}`) : value?.error(`relkit ${command}`),
  };
}
