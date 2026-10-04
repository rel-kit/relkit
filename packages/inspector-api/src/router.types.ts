import type { MaybePromise } from "@relkit/contracts";
import type { ObservabilityQuery, ObservabilityStream } from "@relkit/observability";
import type { ActiveGenerationOptions, InspectorMode } from "./shared.js";
import type { InspectorLoggingOptions } from "./execution.types.js";

/** Router generation, access protection and optional native observation authorities. */
export interface InspectorApiOptions extends ActiveGenerationOptions {
  readonly mode?: InspectorMode;
  readonly environment?: InspectorMode;
  readonly enabled?: boolean;
  readonly bearerToken?: string;
  readonly authorize?: (request: Request) => MaybePromise<boolean>;
  readonly query?: ObservabilityQuery;
  readonly stream?: ObservabilityStream;
  readonly observability?: {
    readonly query: ObservabilityQuery;
    readonly stream: ObservabilityStream;
  };
  readonly maxPreviewBytes?: number;
  readonly logging?: InspectorLoggingOptions;
}
