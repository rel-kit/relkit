import type { Effect } from "effect";
import type { JsonValue, MaybePromise } from "@relkit/contracts";
import type { ActiveGenerationOptions, ResolvedActiveGeneration } from "./shared.js";
import type { GRAPH_COLLECTIONS } from "./graph.js";
import type { RUNTIME_COLLECTIONS } from "./runtime.js";
import type { InspectorQueryFailure } from "./native-edge.types.js";

/** Native authorities supplied once to an Inspector query owner. */
export interface InspectorQueryDependencies extends ActiveGenerationOptions {
  readonly authorize: (request: Request) => MaybePromise<boolean>;
}

/** A bounded declaration-owned projection, never an arbitrary payload traversal. */
export type InspectorProjection =
  | { readonly kind: "graph" | "runtime" }
  | { readonly kind: "environment" | "diagnostics"; readonly request: Request }
  | { readonly kind: "source"; readonly id: string }
  | {
      readonly kind: "graph-list";
      readonly collection: (typeof GRAPH_COLLECTIONS)[number];
      readonly request: Request;
    }
  | {
      readonly kind: "graph-detail";
      readonly collection: (typeof GRAPH_COLLECTIONS)[number];
      readonly id: string;
    }
  | {
      readonly kind: "runtime-list";
      readonly collection: (typeof RUNTIME_COLLECTIONS)[number];
      readonly request: Request;
    }
  | {
      readonly kind: "runtime-detail";
      readonly collection: (typeof RUNTIME_COLLECTIONS)[number];
      readonly id: string;
    }
  | {
      readonly kind: "bucket-objects" | "cache-keys";
      readonly id: string;
      readonly request: Request;
    }
  | {
      readonly kind: "bucket-preview" | "cache-value";
      readonly id: string;
      readonly request: Request;
      readonly maximumBytes: number;
    };

/** Authorization result; denied requests cannot acquire a generation. */
export type InspectorAccess =
  | { readonly allowed: false }
  | { readonly allowed: true; readonly generation: ResolvedActiveGeneration | undefined };

/** Query workflow contract shared by live and deterministic test layers. */
export interface InspectorQueryService {
  readonly access: (
    request: Request,
    includeGeneration: boolean,
  ) => Effect.Effect<InspectorAccess, InspectorQueryFailure>;
  readonly project: (
    generation: ResolvedActiveGeneration,
    projection: InspectorProjection,
  ) => Effect.Effect<JsonValue, InspectorQueryFailure>;
}
