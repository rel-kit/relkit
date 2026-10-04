import type { Effect } from "effect";
import type {
  CandidateOptions,
  CompiledCandidate,
  StartedCandidate,
  CandidateOutput,
} from "./candidate.types.js";

/** Canonical paths calculated before native generation acquisition. */
export interface CandidateDirectory {
  readonly projectRoot: string;
  readonly directoryRoot: string;
  readonly directory: string;
}

/** Replaceable native filesystem/process boundary; lifecycle decisions stay in CandidateService. */
export interface CandidatePlatformService {
  /** Creates the exclusive generation directory. @param context - Validated paths. @returns Native filesystem settlement. */
  readonly directory: (context: CandidateDirectory) => Promise<void>;
  /** Checks the compiled entrypoint. @param entrypoint - Owned absolute path. @returns Native accessibility result. */
  readonly access: (entrypoint: string) => Promise<void>;
  /** Removes the owned directory after its workers settle. @param directory - Owned subtree. @param root - Boundary authority.
   * @returns Native removal settlement. */
  readonly cleanup: (directory: string, root: string) => Promise<void>;
  /** Allocates or adopts a backend port. @param options - Explicit allocation policy. @param hostname - Private listener host.
   * @returns A port after the allocator listener is closed. */
  readonly port: (options: CandidateOptions, hostname: string) => Promise<number>;
  /** Starts the real child. @param entrypoint - Compiled path. @param options - Native process configuration.
   * @param environment - Prepared child environment. @returns The acquired native process. */
  readonly spawn: (
    entrypoint: string,
    options: CandidateOptions,
    environment: Record<string, string>,
  ) => Bun.ReadableSubprocess;
  /** Stops and joins physical exit. @param child - Owned process. @param timeout - Graceful stop milliseconds.
   * @returns Only after native exit, distinct from fiber interruption. */
  readonly stop: (child: Bun.ReadableSubprocess, timeout: number) => Promise<void>;
  /** Consumes both native output pipes. @param child - Owned process. @param options - Output logger.
   * @param directory - Generation context. @param limit - Combined retained-byte budget. @param signal - Owned reader cancellation.
   * @returns Retained output after both readers release their locks. */
  readonly output: (
    child: Bun.ReadableSubprocess,
    options: CandidateOptions,
    directory: string,
    limit: number,
    signal: AbortSignal,
  ) => Promise<CandidateOutput>;
}

/** One generation's lazy compile/start authority and retained native resources. */
export interface CandidateService {
  /** Shares this owner's compilation. @returns Compiled paths and directory cleanup. */
  readonly compile: Effect.Effect<CompiledCandidate, unknown>;
  /** Shares this owner's startup. @returns The real process and its distinct lifetime handles. */
  readonly start: Effect.Effect<StartedCandidate, unknown>;
}
