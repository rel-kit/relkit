import type { JsonValue } from "@relkit/contracts";
import type { DurationInput, MemoryInput } from "./task-core.types.js";
/** Options accepted for jobs service operations. */
export interface JobsServiceOptions {
  readonly limits?: {
    readonly inputBytes?: number;
    readonly outputBytes?: number;
    readonly progressItemBytes?: number;
    readonly streamItemBytes?: number;
  };
  readonly workers?: {
    readonly classes: readonly {
      readonly id: string;
      readonly cpu: number;
      readonly memory: MemoryInput;
      readonly nativeClass?: string;
    }[];
  };
  readonly observation?: {
    readonly pollInterval?: DurationInput;
    readonly readTimeout?: DurationInput;
  };
  readonly maxElapsed?: DurationInput;
  readonly hookTimeout?: DurationInput;
  readonly shutdownGrace?: DurationInput;
}
/** JSON configuration passed to a jobs service provider. */
export type JobsServiceBehavior = Readonly<Record<string, JsonValue>>;
/** Recognized top-level jobs service configuration keys. */
export type JobsServiceOptionName =
  "limits" | "workers" | "observation" | "maxElapsed" | "hookTimeout" | "shutdownGrace";
