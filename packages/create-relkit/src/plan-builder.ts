import { relative } from "node:path";

import { type ScaffoldPlan } from "./add-types.js";
import type { DiscoveredArtifact, DiscoveredProfile } from "./project-discovery-types.js";
import type { ScaffoldDependencyName } from "./scaffold-catalog.js";
import type { PlannedArtifactInput } from "./plan-builder.types.js";

import { runGeneratorPromise, runGeneratorSync } from "./generator-runtime.js";

import { PlanBuilderEffects } from "./plan-builder-effects.js";

/** Per-request Effect owner with synchronous and Promise compatibility edges. */
export class PlanBuilder extends PlanBuilderEffects {
  /**
   * Reads source through the Promise compatibility edge.
   * @param path - Path inside the current project or owned resource.
   * @returns Planned text when present, otherwise the current project file text.
   */
  read(path: string): Promise<string> {
    return runGeneratorPromise(this.readEffect(path));
  }

  /**
   * Plans file creation through the Promise compatibility edge.
   * @param path - Path inside the current project or owned resource.
   * @param content - Complete bytes or text planned for the destination.
   * @param mode - Optional restored or generated permission mode.
   * @returns Completion after the existing contract has been applied.
   */
  create(path: string, content: string, mode?: number): Promise<void> {
    return runGeneratorPromise(this.createEffect(path, content, mode));
  }

  /**
   * Plans a source update through the Promise compatibility edge.
   * @param path - Path inside the current project or owned resource.
   * @param transform - Pure transformation applied atomically to the latest planned source.
   * @returns Completion after the existing contract has been applied.
   */
  update(path: string, transform: (source: string) => string): Promise<void> {
    return runGeneratorPromise(this.updateEffect(path, transform));
  }

  /**
   * Preserves the existing synchronous dependency API.
   * @param name - Authored name or declaration key.
   * @returns Completion after the existing contract has been applied.
   */
  dependency(name: ScaffoldDependencyName): void {
    runGeneratorSync(this.dependencyEffect(name));
  }

  /**
   * Preserves the existing synchronous artifact registration API.
   * @param kind - Authoritative artifact kind.
   * @param value - Artifact domain, source path, binding and optional identity/export form.
   * @returns Completion after the artifact is registered in this request.
   */
  registerArtifact(kind: DiscoveredArtifact["kind"], value: PlannedArtifactInput): void {
    runGeneratorSync(this.registerArtifactEffect(kind, value));
  }

  /**
   * Preserves the existing synchronous profile registration API.
   * @param profile - Selected provider profile.
   * @returns Completion after the existing contract has been applied.
   */
  registerProfile(profile: DiscoveredProfile): void {
    runGeneratorSync(this.registerProfileEffect(profile));
  }

  /**
   * Preserves the existing synchronous script API.
   * @param name - Authored name or declaration key.
   * @param command - Shell command stored under the package script name.
   * @returns Completion after the existing contract has been applied.
   */
  script(name: string, command: string): void {
    runGeneratorSync(this.scriptEffect(name, command));
  }

  /**
   * Preserves the existing synchronous warning API.
   * @param code - Stable category code included in the resulting diagnostic.
   * @param message - Existing user-facing diagnostic.
   * @returns Completion after the existing contract has been applied.
   */
  warning(code: string, message: string): void {
    runGeneratorSync(this.warningEffect(code, message));
  }

  /**
   * Preserves the existing synchronous next-step API.
   * @param command - Shell command shown as a follow-up instruction.
   * @returns Completion after the existing contract has been applied.
   */
  nextStep(command: string): void {
    runGeneratorSync(this.nextStepEffect(command));
  }

  /**
   * Preserves the environment-example Promise API.
   * @param name - Environment variable name.
   * @param value - Example value used only for a new declaration.
   * @returns Completion after the example declaration is planned.
   */
  envExample(name: string, value = ""): Promise<void> {
    return runGeneratorPromise(this.envExampleEffect(name, value));
  }

  /**
   * Preserves the gitignore Promise API.
   * @param pattern - Declaration-owned glob or ignore pattern.
   * @returns Completion after the existing contract has been applied.
   */
  gitignore(pattern: string): Promise<void> {
    return runGeneratorPromise(this.gitignoreEffect(pattern));
  }

  /**
   * Preserves the immutable plan Promise API.
   * @returns The frozen plan containing ordered operations, concrete dependencies and follow-up metadata.
   */
  finish(): Promise<ScaffoldPlan> {
    return runGeneratorPromise(this.finishEffect());
  }

  /**
   * Converts a source path into its existing project-relative representation.
   * @param absolutePath - Absolute path converted relative to the discovered project root.
   * @returns The path relative to the discovered project root using forward slashes.
   */
  relative(absolutePath: string): string {
    return relative(this.discovery.projectRoot, absolutePath).replaceAll("\\", "/");
  }
}
