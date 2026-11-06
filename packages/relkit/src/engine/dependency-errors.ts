import type { DependencyCategory } from "./dependencies.types.js";

/** Compatibility error raised when a handler accesses an undeclared client. */
export class DependencyAccessError extends TypeError {
  readonly category: DependencyCategory;
  readonly dependencyName: string;
  /** Retain the stable public diagnostic fields for this compatibility error.
   * @param category - Declared client capability family.
   * @param name - Declared operation, dependency or field name.
   * @returns undefined
   */
  constructor(category: DependencyCategory, name: string) {
    super(`Dependency "${category}.${name}" is not declared on this function`);
    this.name = "DependencyAccessError";
    this.category = category;
    this.dependencyName = name;
  }
}

/** Compatibility error raised when a declared client has no runtime source. */
export class DependencyNotConfiguredError extends Error {
  /** Retain the stable public diagnostic fields for this compatibility error.
   * @param category - Declared client capability family.
   * @param name - Declared operation, dependency or field name.
   * @returns undefined
   */
  constructor(category: DependencyCategory, name: string) {
    super(`Dependency "${category}.${name}" has no active client`);
    this.name = "DependencyNotConfiguredError";
  }
}
