import { parse, resolve } from "node:path";

import { Effect } from "effect";

import { observeExecution } from "@relkit/contracts/operation";

import { GeneratorPaths } from "./generator-paths.js";

import { domainTry } from "./generator-errors.js";

import { runGeneratorSync } from "./generator-runtime.js";

import type { CreateOptions } from "./options.js";

import type { CreateValidationContext, ValidatedCreateOptions } from "./validate.types.js";

export type { CreateValidationContext, ValidatedCreateOptions } from "./validate.types.js";

import { CreateValidationError } from "./validate-errors.js";

export { CreateValidationError } from "./validate-errors.js";

/**
 * Allowed lowercase npm package-name segment syntax.
 */
const PACKAGE_PART = /^(?![._])[a-z0-9._~-]+$/;

/**
 * Windows drive-root or UNC paths that must not bypass relative destination rules.
 */
const WINDOWS_ABSOLUTE = /^(?:[A-Za-z]:[\\/]|\\\\)/;

/**
 * Names reserved by npm/project layout and rejected for new projects.
 */
const RESERVED_NAMES = new Set(["favicon.ico", "node_modules"]);

/**
 * Checks unscoped or scoped npm names without filesystem or Effect authority.
 * @param value - Unknown candidate project package name.
 * @returns Whether the value is a supported lowercase scoped or unscoped npm package name.
 */
export function isValidPackageName(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 214) return false;
  const parts = value.startsWith("@") ? value.slice(1).split("/") : [value];
  return (
    parts.length === (value.startsWith("@") ? 2 : 1) &&
    parts.every((part) => part.length > 0 && PACKAGE_PART.test(part) && !RESERVED_NAMES.has(part))
  );
}

/**
 * Asserts the existing package-name contract using its unchanged public constructor.
 * @param value - Unknown candidate project package name.
 * @returns Completion for a valid string; invalid input throws RELKIT_CREATE_NAME_INVALID.
 */
export function validatePackageName(value: unknown): asserts value is string {
  if (!isValidPackageName(value))
    throw new CreateValidationError(
      "RELKIT_CREATE_NAME_INVALID",
      "Project name must be a valid npm package name.",
    );
}

/**
 * Resolves a safe creation destination through explicit read-only path authority.
 * @param options - Explicit options retaining existing defaults.
 * @param context - Caller-owned settings and cancellation.
 * @returns The canonical safe destination path after name, ancestry and broad-path validation.
 */
export const resolveCreateDestinationEffect = Effect.fn("CreateValidation.destination")(
  function* (
    options: Pick<CreateOptions, "name" | "directory">,
    context: CreateValidationContext = {},
  ) {
    yield* domainTry(() => validatePackageName(options.name));
    const paths = yield* GeneratorPaths;
    const workingDirectory = resolve(context.cwd ?? (yield* paths.cwd()));
    const cwd = yield* existingDirectoryEffect(workingDirectory, "current directory");
    const input = options.directory ?? options.name;
    if (
      typeof input !== "string" ||
      input.length === 0 ||
      input.includes("\0") ||
      WINDOWS_ABSOLUTE.test(input)
    )
      return yield* failure(
        "RELKIT_CREATE_DESTINATION_INVALID",
        "Destination must be a valid local path.",
      );
    const candidate = resolve(workingDirectory, input);
    const canonical = yield* canonicalizeMissingPathEffect(candidate);
    const roots = [
      cwd,
      context.homeDirectory ?? (yield* paths.home()),
      context.temporaryDirectory ?? (yield* paths.temporaryRoot()),
    ].map((root) => resolve(root));
    if (
      canonical === parse(canonical).root ||
      roots.some((root) => isAncestorOrSame(canonical, root))
    )
      return yield* failure(
        "RELKIT_CREATE_DESTINATION_UNSAFE",
        "Destination is a current, root, or broad directory.",
      );
    return candidate;
  },
  (effect) => observeExecution("generator", "validation.destination", effect),
);

/**
 * Validates destination state using the same path service as the existing synchronous API.
 * @param options - Explicit options retaining existing defaults.
 * @param context - Caller-owned settings and cancellation.
 * @returns Validated options, canonical destination and its initial existence/emptiness state.
 */
export const validateCreateOptionsEffect = Effect.fn("CreateValidation.options")(
  function* (options: CreateOptions, context: CreateValidationContext = {}) {
    if (options === null || typeof options !== "object")
      return yield* failure("RELKIT_CREATE_DESTINATION_INVALID", "Create options are invalid.");
    yield* domainTry(() => validatePackageName(options.name));
    if (typeof options.forceEmptyDirectory !== "boolean")
      return yield* failure(
        "RELKIT_CREATE_DESTINATION_INVALID",
        "The empty-directory override must be boolean.",
      );
    const destination = yield* resolveCreateDestinationEffect(options, context);
    const state = yield* inspectDestinationEffect(destination);
    if (state.exists && !state.empty)
      return yield* failure(
        "RELKIT_CREATE_DESTINATION_NOT_EMPTY",
        "Destination must be absent or an empty directory.",
      );
    if (state.exists && !options.forceEmptyDirectory)
      return yield* failure(
        "RELKIT_CREATE_DESTINATION_EXISTS",
        "Destination already exists; use --force-empty-directory only for an empty directory.",
      );
    return Object.freeze({
      ...options,
      destination,
      destinationExists: state.exists,
      destinationEmpty: state.empty,
    });
  },
  (effect) => observeExecution("generator", "validation.options", effect),
);

/**
 * Preserves synchronous safe-destination resolution and its stable public errors.
 * @param options - Explicit options retaining existing defaults.
 * @param context - Caller-owned settings and cancellation.
 * @returns A canonical safe destination path, retaining the existing validation errors.
 */
export function resolveCreateDestination(
  options: Pick<CreateOptions, "name" | "directory">,
  context: CreateValidationContext = {},
): string {
  return runGeneratorSync(resolveCreateDestinationEffect(options, context));
}

/**
 * Preserves synchronous destination validation and its existing immutable result.
 * @param options - Explicit request options or declared prompt choices.
 * @param context - Caller-owned settings and cancellation.
 * @returns Validated options with a safe canonical destination and initial destination state.
 */
export function validateCreateOptions(
  options: CreateOptions,
  context: CreateValidationContext = {},
): ValidatedCreateOptions {
  return runGeneratorSync(validateCreateOptionsEffect(options, context));
}

import {
  inspectDestinationEffect,
  canonicalizeMissingPathEffect,
  existingDirectoryEffect,
  isAncestorOrSame,
  failure,
} from "./validate-paths.js";
