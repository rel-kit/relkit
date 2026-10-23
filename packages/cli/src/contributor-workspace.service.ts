/** Acquires contributor filesystem, path and process authorities once and binds their cohesive workspace operations. */
import { Context, Effect, Layer } from "effect";
import { GeneratorPaths, generatorPathsLive } from "./scaffolding/index.js";
import { CliFileSystem, fileSystemLayer } from "./services/filesystem.service.js";
import { CliProcess, processLayer } from "./services/process.service.js";
import type { ContributorWorkspaceCapabilities } from "./contributor.types.js";
import { makeContributorRead, makeContributorRoots } from "./contributor-workspace-discovery.js";
import { makeContributorLinks } from "./contributor-workspace-links.js";
import {
  makeContributorRewrite,
  makeContributorPrepare,
} from "./contributor-workspace-mutations.js";
export class ContributorWorkspace extends Context.Service<
  ContributorWorkspace,
  ContributorWorkspaceCapabilities
>()("relkit/cli/ContributorWorkspace", {
  make: (repositoryRoot: string) =>
    Effect.gen(function* () {
      const files = yield* CliFileSystem;
      const paths = yield* GeneratorPaths;
      const processes = yield* CliProcess;
      const read = makeContributorRead(files);
      const roots = makeContributorRoots(files, read);
      const links = makeContributorLinks(roots, read, paths);
      const rewrite = makeContributorRewrite(repositoryRoot, read, links, files, paths);
      const prepare = makeContributorPrepare(repositoryRoot, read, links, rewrite, processes);
      return { roots, links, rewrite, prepare } satisfies ContributorWorkspaceCapabilities;
    }),
}) {}

export function contributorWorkspaceLive(repositoryRoot: string) {
  return Layer.effect(ContributorWorkspace, ContributorWorkspace.make(repositoryRoot));
}

export function contributorWorkspaceLayer(root: string) {
  return contributorWorkspaceLive(root).pipe(
    Layer.provideMerge(Layer.mergeAll(fileSystemLayer, generatorPathsLive, processLayer)),
  );
}
