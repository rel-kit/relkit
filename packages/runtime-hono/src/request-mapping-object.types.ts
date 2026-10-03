import type { BodyState, Missing } from "./request-mapping-body.js";
import type {
  MappingRequest,
  RequestMappingIssue,
  RequestMappingOptions,
} from "./request-mapping.js";
import type { Effect } from "effect";
import type { HttpBoundaryError } from "./http-effect.js";

/** State owned by request mapping object. */
export interface MappingState {
  readonly request: MappingRequest;
  readonly body: BodyState;
  readonly options: RequestMappingOptions;
  readonly issues: RequestMappingIssue[];
  readonly reported: Set<string>;
}

/** Contract for path used by request mapping object. */
export type Path = readonly (string | number)[];

/** Contract for visit used by request mapping object. */
export type Visit = (node: unknown, state: MappingState, path: Path) => Promise<unknown | Missing>;

/** Lazy recursive mapping visitor; fields are evaluated sequentially against shared issues. */
export type EffectVisit = (
  node: unknown,
  state: MappingState,
  path: Path,
) => Effect.Effect<unknown | Missing, HttpBoundaryError>;
