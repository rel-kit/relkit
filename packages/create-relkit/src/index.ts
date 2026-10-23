/** Publishes pure project creation, normalized options and portable template metadata; existing-project AST discovery and add execution belong to the CLI. */

export * from "./options.js";
export * from "./create-capabilities.js";
export * from "./add-types.js";
export * from "./scaffold-catalog.js";
export { resolveCatalogVersion } from "./catalog-resolution.js";
export type { CatalogManifest } from "./catalog-resolution.types.js";
export * from "./prompt-driver.js";
export * from "./create-resolver.js";
export * from "./create-preview.js";
export * from "./template-root.js";
export * from "./validate.js";
export * from "./generate.js";
export * from "./generate-types.js";
export * from "./generate-output.js";

export * from "./generator-filesystem.js";
export * from "./generator-filesystem.types.js";
export * from "./generator-process.js";
export * from "./generator-process.types.js";
export * from "./generator-paths.js";
export * from "./generator-paths.types.js";
export * from "./generator-prompt.js";
export * from "./generator-prompt.types.js";
export * from "./generator-cleanup.js";
export * from "./generator-errors.js";
