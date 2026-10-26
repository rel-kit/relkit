/** Invocation-owned tool identity maps and deferred native failure authority. */
import type {
  NativeToolIdentityService,
  NativeToolRuntimeOptions,
} from "./runtime-native-tools.types.js";
export interface NativeToolBuildContext {
  readonly options: NativeToolRuntimeOptions;
  readonly signal: AbortSignal;
  readonly maxOutputBytes: number;
  readonly invocationId: string;
  readonly traceId: string;
  readonly identity: NativeToolIdentityService;
  readonly publicIds: Map<string, string>;
  readonly relkitNames: Set<string>;
  readonly setFailure: (cause: unknown) => void;
}
