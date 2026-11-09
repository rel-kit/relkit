/**
 * Shared deploy-target conformance suite. The Railway, Vercel and Cloudflare targets of
 * `relkit deploy init` run these cases, and a new target runs the same ones.
 */
import type { DeployTarget, DeployTargetPlan } from "@relkit/cli/deploy-targets";
import type { ConformanceHarness } from "./conformance.types.js";
import type {
  DeployTargetConformanceCase,
  DeployTargetConformanceCaseId,
  DeployTargetConformanceOptions,
} from "./deploy-target-conformance.types.js";
import { check, conformanceHarness, same, SKIPPED } from "./conformance.js";

export type * from "./deploy-target-conformance.types.js";

/** The cases every deploy target passes. */
export const DEPLOY_TARGET_CONFORMANCE_CASES: readonly DeployTargetConformanceCase[] =
  Object.freeze([
    { id: "naming", description: "the id, label and runtimes are well formed" },
    { id: "every-runtime", description: "every declared runtime renders non-empty files" },
    { id: "deterministic", description: "the same input renders the same bytes" },
    { id: "relative-paths", description: "file paths are unique and stay inside the project" },
    { id: "ci-workflow", description: "the files include a GitHub Actions workflow" },
    { id: "next-steps", description: "the plan tells the developer what to do next" },
    { id: "graph-required", description: "a target that reads the graph refuses a missing one" },
  ]);

/**
 * Creates the deploy-target conformance harness for one target.
 * @param options - The target, a project root and, for targets that read it, a graph.
 * @returns Cases and a runner; pass it to `runConformance` or run each case as a test.
 * @example
 * ```ts
 * import { railwayDeployTarget } from "@relkit/cli/deploy-targets";
 * import { runConformance } from "@relkit/testing/conformance";
 * import { createDeployTargetConformanceHarness } from "@relkit/testing/deploy-target-conformance";
 *
 * const harness = createDeployTargetConformanceHarness({
 *   target: railwayDeployTarget,
 *   root: process.cwd(),
 * });
 * console.log((await runConformance(harness)).passed);
 * ```
 */
export function createDeployTargetConformanceHarness(
  options: DeployTargetConformanceOptions,
): ConformanceHarness<DeployTargetConformanceCaseId> {
  const { target } = options;
  const graph = options.graph === undefined ? undefined : JSON.stringify(options.graph);
  const plan = (runtime = target.defaultRuntime) =>
    target.plan({ root: options.root, runtime, graph: target.needsGraph ? graph : undefined });
  const requireGraph = () => {
    if (target.needsGraph && graph === undefined)
      throw new Error(`${target.id} reads the graph; pass options.graph`);
  };
  return conformanceHarness("deploy-target", DEPLOY_TARGET_CONFORMANCE_CASES, {
    naming: async () => {
      check(/^[a-z][a-z0-9-]*$/.test(target.id), "a lower-case id", target.id);
      check(target.label.trim().length > 0, "a label", target.label);
      check(target.runtimes.length > 0, "at least one runtime", target.runtimes);
      const known = target.runtimes.every((runtime) =>
        ["bun", "node", "workers"].includes(runtime),
      );
      check(known, "known runtimes", target.runtimes);
      check(target.runtimes.includes(target.defaultRuntime), "the default is declared");
    },
    "every-runtime": async () => {
      requireGraph();
      for (const runtime of target.runtimes) {
        const rendered = await plan(runtime);
        check(rendered.files.length > 0, `files for ${runtime}`);
        const empty = rendered.files.filter((file) => file.content.trim() === "");
        check(empty.length === 0, `no empty file for ${runtime}`, empty);
      }
    },
    deterministic: async () => {
      requireGraph();
      for (const runtime of target.runtimes)
        check(same(snapshot(await plan(runtime)), snapshot(await plan(runtime))), runtime);
    },
    "relative-paths": async () => {
      requireGraph();
      for (const runtime of target.runtimes) {
        const paths = (await plan(runtime)).files.map((file) => file.path);
        const unsafe = paths.filter(
          (path) => path.startsWith("/") || path.includes("\\") || path.split("/").includes(".."),
        );
        check(unsafe.length === 0, "relative POSIX paths inside the project", unsafe);
        check(new Set(paths).size === paths.length, "unique paths", paths);
      }
    },
    "ci-workflow": async () => {
      requireGraph();
      const files = (await plan()).files;
      const workflows = files.filter((file) =>
        /^\.github\/workflows\/[^/]+\.ya?ml$/.test(file.path),
      );
      check(
        workflows.length > 0,
        "a workflow under .github/workflows",
        files.map((f) => f.path),
      );
      check(
        workflows.every((file) => /\bon:/.test(file.content)),
        "workflows declare triggers",
      );
    },
    "next-steps": async () => {
      requireGraph();
      const steps = (await plan()).nextSteps;
      check(steps.length > 0 && steps.every((step) => step.trim() !== ""), "next steps", steps);
    },
    "graph-required": async () => {
      if (!target.needsGraph) return SKIPPED;
      await refused(target, options.root, undefined, "a missing graph");
      await refused(target, options.root, "{ not json", "a graph that is not JSON");
    },
  });
}

/** @param rendered - A plan. @returns Its files and steps in comparable form. */
function snapshot(rendered: DeployTargetPlan) {
  return {
    files: rendered.files.map((file) => [file.path, file.content]),
    steps: rendered.nextSteps,
  };
}

/**
 * Expects a plan to reject with a `RELKIT_DEPLOY_*` code.
 * @param target - Target. @param root - Project root.
 * @param graph - Graph text to pass. @param label - What was refused.
 */
async function refused(
  target: DeployTarget,
  root: string,
  graph: string | undefined,
  label: string,
): Promise<void> {
  try {
    await target.plan({ root, runtime: target.defaultRuntime, graph });
  } catch (error) {
    const code = (error as { readonly code?: unknown }).code;
    check(
      typeof code === "string" && /^RELKIT_DEPLOY_[A-Z_]+$/.test(code),
      `${label} has a code`,
      code,
    );
    return;
  }
  throw new Error(`${label} should be refused`);
}
