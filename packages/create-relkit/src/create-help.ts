/** Formats `create-relkit --help` from the same option lists the parser accepts, and creation warnings. */

import type { CreateCapabilityWarning } from "./create-capabilities.types.js";
import { CREATE_CLOUDS, CREATE_DEPLOYMENTS, CREATE_JOBS, CREATE_TEMPLATES } from "./options.js";
import { PACKAGE_MANAGERS } from "./package-manager.js";

/**
 * Builds the creator's usage text.
 * @returns Plain-text help ending with a newline.
 */
export function formatCreateHelp(): string {
  return [
    "Usage: create-relkit <name> [options]",
    "",
    "Options:",
    `  --template <${CREATE_TEMPLATES.join("|")}>  Starter template (default: minimal)`,
    `  --jobs <${CREATE_JOBS.join("|")}>  Jobs service for the tasks template`,
    `  --cloud <${CREATE_CLOUDS.join("|")}>  Cloud selection (default: none)`,
    `  --deploy <${CREATE_DEPLOYMENTS.join("|")}>  Deployment selection (default: none)`,
    "  --directory <path>  Destination directory (default: the project name)",
    `  --package-manager <${PACKAGE_MANAGERS.join("|")}>  Installs and runs with it (default: the invoking one)`,
    "  --no-install  Skip dependency installation",
    "  --no-git  Skip Git initialization",
    "  --no-examples  Leave out example sources",
    "  --force-empty-directory  Allow an existing empty destination",
    "  --strict  Refuse combinations CI has not tested instead of warning",
    "  --json  Print a machine-readable result",
    "  -h, --help  Show this help",
    "",
  ].join("\n");
}

/**
 * Formats one coded creation warning for standard error.
 * @param warning - Warning returned by option resolution.
 * @returns One line with the code, explanation and docs link.
 */
export function formatCreateWarning(warning: CreateCapabilityWarning): string {
  return `${warning.code}: ${warning.message} See ${warning.docs}\n`;
}
