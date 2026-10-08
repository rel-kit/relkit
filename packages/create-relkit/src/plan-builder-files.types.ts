import type { Effect } from "effect";
import type { GeneratorFileSystem } from "./generator-filesystem.js";
import type { GeneratorDomainError, GeneratorIoError } from "./generator-errors.js";

/** File-planning capabilities retaining their exact native read requirement. */
export interface PlanBuilderFileOperations {
  /**
   * Composes read with explicit services, typed failures and owned resource lifetime.
   * @param path - Path inside the current project or owned resource.
   * @returns Planned file text when present, otherwise text read through explicit filesystem authority.
   */
  readonly readEffect: (
    path: string,
  ) => Effect.Effect<string, GeneratorIoError, GeneratorFileSystem>;
  /**
   * Composes create with explicit services, typed failures and owned resource lifetime.
   * @param path - Path inside the current project or owned resource.
   * @param content - Complete bytes or text planned for the destination.
   * @param mode - Optional restored or generated permission mode.
   * @returns Completion after collision preflight and atomic reservation of the new planned file.
   */
  readonly createEffect: (
    path: string,
    content: string,
    mode?: number,
  ) => Effect.Effect<void, GeneratorDomainError | GeneratorIoError, GeneratorFileSystem>;
  /**
   * Composes update with explicit services, typed failures and owned resource lifetime.
   * @param path - Path inside the current project or owned resource.
   * @param transform - Pure transformation applied atomically to the latest planned source.
   * @returns Completion after the transform is applied atomically to the latest planned source.
   */
  readonly updateEffect: (
    path: string,
    transform: (source: string) => string,
  ) => Effect.Effect<void, GeneratorDomainError | GeneratorIoError, GeneratorFileSystem>;
  /**
   * Composes append Line with explicit services, typed failures and owned resource lifetime.
   * @param path - Path inside the current project or owned resource.
   * @param line - Complete owned line to append.
   * @param present - Pure predicate detecting an already authored line.
   * @returns Completion after a missing line is added without replacing an existing matching declaration.
   */
  readonly appendLineEffect: (
    path: string,
    line: string,
    present: (source: string) => boolean,
  ) => Effect.Effect<void, GeneratorDomainError | GeneratorIoError, GeneratorFileSystem>;
  /**
   * Plans an environment example only when the declaration is absent.
   * @param name - Environment variable name.
   * @param value - Example value used only for a new declaration.
   * @returns An Effect planning the env example through explicit filesystem authority.
   */
  readonly envExampleEffect: (
    name: string,
    value?: string,
  ) => Effect.Effect<void, GeneratorDomainError | GeneratorIoError, GeneratorFileSystem>;
  /**
   * Composes gitignore with explicit services, typed failures and owned resource lifetime.
   * @param pattern - Declaration-owned glob or ignore pattern.
   * @returns Completion after the missing ignore pattern is added to planned .gitignore source.
   */
  readonly gitignoreEffect: (
    pattern: string,
  ) => Effect.Effect<void, GeneratorDomainError | GeneratorIoError, GeneratorFileSystem>;
}
