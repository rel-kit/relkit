/**
 * The deploy-target contract behind `relkit deploy init <target>`. A target renders the native
 * platform configuration and a CI workflow for one project and changes no cloud resource; the
 * command writes the files, refusing to overwrite differing ones without `--force`.
 */
import type { RuntimeAdapterName } from "relkit/runtime";

/** One generated file, relative to the project root. */
export interface DeployTargetFile {
  /** POSIX path relative to the project root, such as `.github/workflows/deploy.yml`. */
  readonly path: string;
  readonly content: string;
}

/** What `relkit deploy init` passes to a target. */
export interface DeployTargetInput {
  /** Absolute project root; a target may read project files such as `package.json`. */
  readonly root: string;
  /** Runtime selected with `--runtime`, always one of the target's `runtimes`. */
  readonly runtime: RuntimeAdapterName;
  /**
   * The compiled application graph (`.relkit/generated/application.graph.json`) as text, when
   * the target sets `needsGraph`; undefined otherwise.
   */
  readonly graph: string | undefined;
}

/** A target's rendering for one project. */
export interface DeployTargetPlan {
  /** Files in write order. */
  readonly files: readonly DeployTargetFile[];
  /** What the developer does next, one step per entry. */
  readonly nextSteps: readonly string[];
}

/** A platform target for `relkit deploy init`. */
export interface DeployTarget {
  /** The `relkit deploy init <id>` argument, in lower case. */
  readonly id: string;
  /** Display name in command output. */
  readonly label: string;
  /** Runtimes the target accepts with `--runtime`. */
  readonly runtimes: readonly RuntimeAdapterName[];
  /** Runtime used without `--runtime`; one of `runtimes`. */
  readonly defaultRuntime: RuntimeAdapterName;
  /** True when the target reads the compiled graph, so `relkit check` must have run. */
  readonly needsGraph: boolean;
  /**
   * Renders the files and next steps. Pure apart from reading project files: it never calls the
   * platform. Rejects with an Error whose `code` is a `RELKIT_DEPLOY_*` code when the input is
   * unusable, such as a graph that is not valid JSON.
   * @param input - Project root, runtime and graph.
   * @returns The plan.
   */
  readonly plan: (input: DeployTargetInput) => Promise<DeployTargetPlan>;
}
