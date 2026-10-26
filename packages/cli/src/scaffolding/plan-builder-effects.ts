/** Owns request-local scaffold state in Effect and serializes file reservations, dependency registration and artifact updates before plan finalization. */

import { finishPlannedRequest } from "./plan-builder-finish.js";
import { Effect, Ref } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { type AddRequest } from "create-relkit/internal/add-types";
import type {
  DiscoveredArtifact,
  DiscoveredProfile,
  ProjectDiscovery,
} from "./project-discovery-types.js";
import type { ScaffoldDependencyName } from "create-relkit/internal/scaffold-catalog";
import type { PlanBuilderState, PlannedArtifactInput } from "./plan-builder.types.js";

import { planBuilderFiles } from "./plan-builder-files.js";
/** Private Ref-backed Effect implementation inherited by the public compatibility owner. */
export class PlanBuilderEffects {
  readonly #state: Ref.Ref<PlanBuilderState>;
  readonly #files: ReturnType<typeof planBuilderFiles>;
  /**
   * Creates isolated planning state without sharing mutations with another request.
   * @param request - Normalized scaffold request.
   * @param discovery - Read-only discovery snapshot.
   * @remarks Ref.makeUnsafe is required only by this existing synchronous constructor.
   * @returns The invocation-owned instance.
   */
  constructor(
    readonly request: AddRequest,
    readonly discovery: ProjectDiscovery,
  ) {
    this.#state = Ref.makeUnsafe<PlanBuilderState>({
      files: new Map(),
      dependencies: new Set(),
      scripts: new Map(),
      warnings: new Map(),
      nextSteps: new Set(),
      artifacts: [],
      profiles: [],
    });
    this.#files = planBuilderFiles(this.#state, discovery);
  }
  /**
   * Reads the planned source first, then the explicit filesystem service.
   * @param path - Path inside the current project or owned resource.
   * @returns Planned file text when present, otherwise text read through explicit filesystem authority.
   */
  readonly readEffect = (path: string) => this.#files.readEffect(path);
  /**
   * Atomically reserves one create operation after checking the native destination.
   * @param path - Path inside the current project or owned resource.
   * @param content - Complete bytes or text planned for the destination.
   * @param mode - Optional restored or generated permission mode.
   * @returns Completion after collision preflight and atomic reservation of the new planned file.
   */
  readonly createEffect = (path: string, content: string, mode?: number) =>
    this.#files.createEffect(path, content, mode);
  /**
   * Adds a source transformation to this request; transformations preserve expected validator errors.
   * @param path - Path inside the current project or owned resource.
   * @param transform - Pure transformation applied atomically to the latest planned source.
   * @returns Completion after the transform is applied atomically to the latest planned source.
   */
  readonly updateEffect = (path: string, transform: (source: string) => string) =>
    this.#files.updateEffect(path, transform);
  /**
   * Plans an environment example only when the declaration is absent.
   * @param name - Environment variable name.
   * @param value - Example value used only for a new declaration.
   * @returns An Effect planning the env example through explicit filesystem authority.
   */
  readonly envExampleEffect = (name: string, value = "") =>
    this.#files.envExampleEffect(name, value);
  /**
   * Plans a gitignore entry without duplicating an authored line.
   * @param pattern - Declaration-owned glob or ignore pattern.
   * @returns Completion after the missing ignore pattern is added to planned .gitignore source.
   */
  readonly gitignoreEffect = (pattern: string) => this.#files.gitignoreEffect(pattern);
  /**
   * Records a required dependency through the authoritative request Ref.
   * @param name - Authored name or declaration key.
   * @returns Completion after the supported dependency is recorded in this request's Ref.
   */
  readonly dependencyEffect = Effect.fn("PlanBuilder.dependency")(
    (name: ScaffoldDependencyName) =>
      Ref.update(this.#state, (state) => ({
        ...state,
        dependencies: new Set(state.dependencies).add(name),
      })),
    (effect) => observeExecution("generator", "planning.dependency", effect),
  );
  /**
   * Adds one artifact identity to the current request's discovery view.
   * @param kind - Authoritative artifact kind.
   * @param value - Artifact domain, source path, binding and optional identity/export form.
   * @returns An observed Ref update registering the authoritative kind and projected artifact fields.
   */
  readonly registerArtifactEffect = Effect.fn("PlanBuilder.registerArtifact")(
    (kind: DiscoveredArtifact["kind"], value: PlannedArtifactInput) =>
      Ref.update(this.#state, (state) => ({
        ...state,
        artifacts: [
          ...state.artifacts,
          {
            kind,
            domain: value.domain,
            path: value.path,
            binding: value.binding,
            id: value.id,
            factory: "scaffold",
            exported: true,
            exportKind: value.exportKind ?? "default",
            options: [],
          },
        ],
      })),
    (effect) => observeExecution("generator", "planning.registerArtifact", effect),
  );
  /**
   * Adds one provider profile to the current request's discovery view.
   * @param profile - Selected provider profile.
   * @returns Completion after the discovered/planned profile projection is updated for this request.
   */
  readonly registerProfileEffect = Effect.fn("PlanBuilder.registerProfile")(
    (profile: DiscoveredProfile) =>
      Ref.update(this.#state, (state) => ({ ...state, profiles: [...state.profiles, profile] })),
    (effect) => observeExecution("generator", "planning.registerProfile", effect),
  );
  /**
   * Records one owned package script.
   * @param name - Authored name or declaration key.
   * @param command - Shell command stored under the package script name.
   * @returns Completion after the script name and command are recorded for manifest planning.
   */
  readonly scriptEffect = Effect.fn("PlanBuilder.script")(
    (name: string, command: string) =>
      Ref.update(this.#state, (state) => ({
        ...state,
        scripts: new Map(state.scripts).set(name, command),
      })),
    (effect) => observeExecution("generator", "planning.script", effect),
  );
  /**
   * Records a bounded warning by its stable code.
   * @param code - Stable category code included in the resulting diagnostic.
   * @param message - Existing user-facing diagnostic.
   * @returns Completion after the warning is recorded under its stable category code.
   */
  readonly warningEffect = Effect.fn("PlanBuilder.warning")(
    (code: string, message: string) =>
      Ref.update(this.#state, (state) => ({
        ...state,
        warnings: new Map(state.warnings).set(code, Object.freeze({ code, message })),
      })),
    (effect) => observeExecution("generator", "planning.warning", effect),
  );
  /**
   * Records one next command without duplicating it.
   * @param command - Shell command shown as a follow-up instruction.
   * @returns Completion after the follow-up command is deduplicated in request state.
   */
  readonly nextStepEffect = Effect.fn("PlanBuilder.nextStep")(
    (command: string) =>
      Ref.update(this.#state, (state) => ({
        ...state,
        nextSteps: new Set(state.nextSteps).add(command),
      })),
    (effect) => observeExecution("generator", "planning.nextStep", effect),
  );
  /**
   * Finishes manifest ownership and returns a deterministic immutable plan.
   * @returns The frozen plan containing ordered operations, concrete dependencies and public follow-up metadata.
   */
  readonly finishEffect = Effect.fn("PlanBuilder.finish")(() =>
    finishPlannedRequest(this, this.#state),
  );
  /**
   * Returns a synchronous immutable projection of this request's authoritative Ref.
   * @returns A new array combining discovered artifacts and this request's planned artifacts.
   */
  get artifacts(): readonly DiscoveredArtifact[] {
    return [...this.discovery.artifacts, ...Ref.getUnsafe(this.#state).artifacts];
  }
  /**
   * Returns a synchronous immutable profile projection of the request Ref.
   * @returns A new array combining discovered profiles and this request's planned profiles.
   */
  get profiles(): readonly DiscoveredProfile[] {
    return [...this.discovery.profiles, ...Ref.getUnsafe(this.#state).profiles];
  }
}
