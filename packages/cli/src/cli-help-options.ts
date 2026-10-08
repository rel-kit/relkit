import { option } from "./cli-help-builders.js";

/** Reused static project-directory flag; discovery occurs only during execution. */
export const projectRoot = option(
  "project-root",
  "string",
  "Application directory (defaults to cwd)",
);
/** Reused configuration selector; help never reads environment values. */
export const environment = option("environment", "string", "Provider environment configuration", [
  "env",
]);
/** Shared deployment syntax; secret values are accepted by the owning command boundary. */
export const deployOptions = [
  projectRoot,
  option("stack", "string", "Pulumi stack name (default: development)"),
  option("backend", "string", "cloud, local, or object-storage URL"),
  option("config", "key=value", "Set a non-secret Pulumi value; repeatable"),
  option("config-secret", "key=value", "Set a secret Pulumi value; repeatable"),
  option("non-interactive", "boolean", "Approve protected operations", ["yes"]),
];
