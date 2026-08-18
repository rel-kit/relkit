import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { relative, resolve } from "node:path";
import type { EvaluatorSideEffectKind } from "./evaluator-protocol.js";

type MutableRecord = Record<string, unknown>;
type GenericFunction = (...args: unknown[]) => unknown;
type Restore = () => void;
type Violate = (kind: EvaluatorSideEffectKind, operation: string, target: string) => never;

const pathMethods: Readonly<Record<string, readonly number[]>> = {
  writeFile: [0],
  writeFileSync: [0],
  appendFile: [0],
  appendFileSync: [0],
  truncate: [0],
  truncateSync: [0],
  mkdir: [0],
  mkdirSync: [0],
  mkdtemp: [0],
  mkdtempSync: [0],
  rm: [0],
  rmSync: [0],
  rmdir: [0],
  rmdirSync: [0],
  unlink: [0],
  unlinkSync: [0],
  rename: [0, 1],
  renameSync: [0, 1],
  copyFile: [1],
  copyFileSync: [1],
  link: [1],
  linkSync: [1],
  symlink: [1],
  symlinkSync: [1],
  createWriteStream: [0],
};

export function installFileDetectors(
  options: { readonly projectRoot: string; readonly generatedDirectory: string },
  restores: Restore[],
  violate: Violate,
): void {
  const targets = [fs as unknown as MutableRecord, (fs.promises ?? {}) as MutableRecord];
  for (const target of targets) {
    for (const [name, indices] of Object.entries(pathMethods)) {
      patchPathMethod(target, name, indices, options, restores, violate);
    }
    patchOpen(target, options, restores, violate);
  }
  const bun = Bun as unknown as MutableRecord;
  if (typeof bun.write === "function") {
    const original = bun.write as GenericFunction;
    bun.write = (...args: unknown[]) => {
      guardPaths("Bun.write", [args[0]], options, violate);
      return original(...args);
    };
    restores.push(() => {
      bun.write = original;
    });
  }
}

function patchPathMethod(
  target: MutableRecord,
  name: string,
  indices: readonly number[],
  options: { readonly projectRoot: string; readonly generatedDirectory: string },
  restores: Restore[],
  violate: Violate,
): void {
  const original = target[name];
  if (typeof original !== "function") return;
  const method = original as GenericFunction;
  target[name] = function (this: unknown, ...args: unknown[]) {
    guardPaths(
      name,
      indices.map((index) => args[index]),
      options,
      violate,
    );
    return method.apply(this, args);
  };
  restores.push(() => {
    target[name] = original;
  });
}

function patchOpen(
  target: MutableRecord,
  options: { readonly projectRoot: string; readonly generatedDirectory: string },
  restores: Restore[],
  violate: Violate,
): void {
  for (const name of ["open", "openSync"]) {
    const original = target[name];
    if (typeof original !== "function") continue;
    const method = original as GenericFunction;
    target[name] = function (this: unknown, ...args: unknown[]) {
      const flags = args[1];
      if (typeof flags === "string" && /[wax+]/.test(flags)) {
        guardPaths(name, [args[0]], options, violate);
      }
      return method.apply(this, args);
    };
    restores.push(() => {
      target[name] = original;
    });
  }
}

function guardPaths(
  operation: string,
  values: readonly unknown[],
  options: { readonly projectRoot: string; readonly generatedDirectory: string },
  violate: Violate,
): void {
  for (const value of values) {
    const path = filePath(value);
    if (path === undefined || isInside(path, options.generatedDirectory)) continue;
    violate("write-outside-generated-sandbox", operation, displayPath(path, options.projectRoot));
  }
}

function filePath(value: unknown): string | undefined {
  if (typeof value === "string") return resolve(value);
  if (value instanceof URL && value.protocol === "file:") return fileURLToPath(value);
  return undefined;
}

function isInside(path: string, generatedDirectory: string): boolean {
  const rest = relative(resolve(generatedDirectory), resolve(path));
  return rest === "" || (!rest.startsWith("..") && !rest.startsWith("/"));
}

function displayPath(path: string, projectRoot: string): string {
  const projectRelative = relative(resolve(projectRoot), resolve(path));
  return projectRelative === "" ? "." : projectRelative.replaceAll("\\", "/");
}
