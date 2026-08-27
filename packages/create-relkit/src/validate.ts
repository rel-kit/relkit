import { lstatSync, readdirSync, realpathSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, parse, relative, resolve } from "node:path";
import type { CreateOptions } from "./options.js";

const PACKAGE_PART = /^(?![._])[a-z0-9._~-]+$/;
const WINDOWS_ABSOLUTE = /^(?:[A-Za-z]:[\\/]|\\\\)/;
const RESERVED_NAMES = new Set(["favicon.ico", "node_modules"]);

export class CreateValidationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CreateValidationError";
  }
}

export interface CreateValidationContext {
  readonly cwd?: string;
  readonly homeDirectory?: string;
  readonly temporaryDirectory?: string;
}

export interface ValidatedCreateOptions extends CreateOptions {
  readonly destination: string;
  readonly destinationExists: boolean;
  readonly destinationEmpty: boolean;
}

/** Returns whether a value is a valid unscoped or scoped npm package name. */
export function isValidPackageName(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 214) return false;
  const parts = value.startsWith("@") ? value.slice(1).split("/") : [value];
  if (parts.length !== (value.startsWith("@") ? 2 : 1)) return false;
  return parts.every(
    (part) => part.length > 0 && PACKAGE_PART.test(part) && !RESERVED_NAMES.has(part),
  );
}

/** Throws a stable validation error instead of normalizing an invalid name. */
export function validatePackageName(value: unknown): asserts value is string {
  if (!isValidPackageName(value)) {
    throw new CreateValidationError(
      "RELKIT_CREATE_NAME_INVALID",
      "Project name must be a valid npm package name.",
    );
  }
}

export function resolveCreateDestination(
  options: Pick<CreateOptions, "name" | "directory">,
  context: CreateValidationContext = {},
): string {
  validatePackageName(options.name);
  const workingDirectory = resolve(context.cwd ?? process.cwd());
  const cwd = existingDirectory(workingDirectory, "current directory");
  const input = options.directory ?? options.name;
  if (
    typeof input !== "string" ||
    input.length === 0 ||
    input.includes("\0") ||
    WINDOWS_ABSOLUTE.test(input)
  ) {
    throw new CreateValidationError(
      "RELKIT_CREATE_DESTINATION_INVALID",
      "Destination must be a valid local path.",
    );
  }
  const candidate = resolve(workingDirectory, input);
  rejectBroadPath(canonicalizeMissingPath(candidate), cwd, context);
  return candidate;
}

/** Validates name, path, and destination state using read-only filesystem calls. */
export function validateCreateOptions(
  options: CreateOptions,
  context: CreateValidationContext = {},
): ValidatedCreateOptions {
  if (options === null || typeof options !== "object") {
    throw new CreateValidationError(
      "RELKIT_CREATE_DESTINATION_INVALID",
      "Create options are invalid.",
    );
  }
  validatePackageName(options.name);
  if (typeof options.forceEmptyDirectory !== "boolean") {
    throw new CreateValidationError(
      "RELKIT_CREATE_DESTINATION_INVALID",
      "The empty-directory override must be boolean.",
    );
  }
  const destination = resolveCreateDestination(options, context);
  const state = inspectDestination(destination);
  if (state.exists && !state.empty) {
    throw new CreateValidationError(
      "RELKIT_CREATE_DESTINATION_NOT_EMPTY",
      "Destination must be absent or an empty directory.",
    );
  }
  if (state.exists && !options.forceEmptyDirectory) {
    throw new CreateValidationError(
      "RELKIT_CREATE_DESTINATION_EXISTS",
      "Destination already exists; use --force-empty-directory only for an empty directory.",
    );
  }
  return Object.freeze({
    ...options,
    destination,
    destinationExists: state.exists,
    destinationEmpty: state.empty,
  });
}

type DestinationState = { readonly exists: boolean; readonly empty: boolean };

function inspectDestination(path: string): DestinationState {
  let info: ReturnType<typeof lstatSync>;
  try {
    info = lstatSync(path);
  } catch (error) {
    if (isNotFound(error)) return { exists: false, empty: false };
    throw invalidDestination("Destination could not be inspected.");
  }
  if (info.isSymbolicLink()) throw unsafeDestination("Destination must not be a symbolic link.");
  if (!info.isDirectory()) throw invalidDestination("Destination is not a directory.");
  try {
    return { exists: true, empty: readdirSync(path).length === 0 };
  } catch {
    throw invalidDestination("Destination directory could not be read.");
  }
}

function canonicalizeMissingPath(path: string): string {
  let current = path;
  const missing: string[] = [];
  while (true) {
    try {
      const info = lstatSync(current);
      if (missing.length > 0 && !info.isDirectory()) {
        throw invalidDestination("A destination parent is not a directory.");
      }
      if (missing.length === 0 && info.isSymbolicLink()) {
        throw unsafeDestination("Destination must not be a symbolic link.");
      }
      const base = realpathSync.native(current);
      return missing.reverse().reduce((parent, part) => join(parent, part), base);
    } catch (error) {
      if (!isNotFound(error)) {
        if (error instanceof CreateValidationError) throw error;
        throw invalidDestination("Destination path could not be resolved.");
      }
      const parent = dirname(current);
      if (parent === current) throw invalidDestination("Destination path could not be resolved.");
      missing.push(current.slice(parent.length + 1));
      current = parent;
    }
  }
}

function rejectBroadPath(path: string, cwd: string, context: CreateValidationContext): void {
  const broadRoots = [
    cwd,
    context.homeDirectory ?? homedir(),
    context.temporaryDirectory ?? tmpdir(),
  ].map((root) => resolve(root));
  if (path === parse(path).root || broadRoots.some((root) => isAncestorOrSame(path, root))) {
    throw unsafeDestination("Destination is a current, root, or broad directory.");
  }
}

function existingDirectory(path: string, label: string): string {
  const resolved = resolve(path);
  try {
    const info = lstatSync(resolved);
    if (!info.isDirectory()) throw invalidDestination(`${label} is not a directory.`);
    return realpathSync.native(resolved);
  } catch (error) {
    if (error instanceof CreateValidationError) throw error;
    throw invalidDestination(`${label} could not be resolved.`);
  }
}

function isAncestorOrSame(parent: string, child: string): boolean {
  const relation = relative(parent, child);
  return relation === "" || (!relation.startsWith("..") && !isAbsolute(relation));
}

function invalidDestination(message: string): CreateValidationError {
  return new CreateValidationError("RELKIT_CREATE_DESTINATION_INVALID", message);
}

function unsafeDestination(message: string): CreateValidationError {
  return new CreateValidationError("RELKIT_CREATE_DESTINATION_UNSAFE", message);
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
