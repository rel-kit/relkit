import { option } from "./cli-help-builders.js";

export const projectRoot = option(
  "project-root",
  "string",
  "Application directory (defaults to cwd)",
);
export const environment = option("environment", "string", "Provider environment configuration", [
  "env",
]);
export const deployOptions = [
  projectRoot,
  option("stack", "string", "Pulumi stack name (default: development)"),
  option("backend", "string", "cloud, local, or object-storage URL"),
  option("config", "key=value", "Set a non-secret Pulumi value; repeatable"),
  option("config-secret", "key=value", "Set a secret Pulumi value; repeatable"),
  option("non-interactive", "boolean", "Approve protected operations", ["yes"]),
];
