import { Effect } from "effect";
import {
  ContributorWorkspace,
  contributorWorkspaceLayer,
} from "./contributor-workspace.service.js";
import { runCliEffect } from "./cli-runtime.js";

/**
 * Lists workspace package roots using a single native contributor graph.
 * @param root - Catalog-owning repository root.
 * @returns Workspace names and their package directories.
 */
export function workspacePackageRoots(root: string): Promise<ReadonlyMap<string, string>> {
  return runCliEffect(
    Effect.flatMap(ContributorWorkspace, (service) => service.roots(root)),
    contributorWorkspaceLayer(root),
  );
}

/**
 * Shares matching runtime dependencies exposed by linked workspaces.
 * @param root - Repository containing workspaces and default/named catalogs.
 * @param direct - Runtime and development dependency declarations.
 * @param runtimeDependencies - Runtime declarations requiring shared module identity.
 * @returns Workspace and external dependency link roots.
 */
export function workspaceDependencyLinks(
  root: string,
  direct: Readonly<Record<string, string>>,
  runtimeDependencies: Readonly<Record<string, string>>,
): Promise<ReadonlyMap<string, string>> {
  return runCliEffect(
    Effect.flatMap(ContributorWorkspace, (service) =>
      service.links(root, direct, runtimeDependencies),
    ),
    contributorWorkspaceLayer(root),
  );
}
