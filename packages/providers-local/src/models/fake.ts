import {
  createModelCapabilities,
  createModelRequest,
  createModelTurn,
  normalizeModelProfile,
  type ModelProvider,
  type ModelRequest,
  type ModelTurn,
} from "@zsys/agents";

const DEFAULT_MAX_INPUT_BYTES = 64 * 1024;
const DEFAULT_MAX_OUTPUT_BYTES = 16 * 1024;

export interface FakeModelOptions {
  readonly profile?: string;
  readonly maxInputBytes?: number;
  readonly maxOutputBytes?: number;
  readonly script?: readonly ModelTurn[];
}

export type FakeModelRequest = Omit<ModelRequest, "signal">;

export interface FakeModelCall {
  readonly index: number;
  readonly request: FakeModelRequest;
  readonly turn: ModelTurn;
}

export interface FakeModelProvider extends ModelProvider {
  /** Replaces the script and clears the prior call transcript. */
  readonly script: (turns: readonly ModelTurn[]) => void;
  /** Returns an immutable, signal-free transcript for deterministic assertions. */
  readonly inspect: () => readonly FakeModelCall[];
  readonly calls: readonly FakeModelCall[];
  readonly reset: () => void;
}

export class FakeModelError extends Error {
  constructor(
    readonly code: "ZSYS_FAKE_MODEL_PROFILE_MISMATCH" | "ZSYS_FAKE_MODEL_SCRIPT_EXHAUSTED",
    message: string,
  ) {
    super(message);
    this.name = "FakeModelError";
  }
}

/** Creates a deterministic provider with no network or vendor-model dependency. */
export function createFakeModelProvider(options: FakeModelOptions = {}): FakeModelProvider {
  const profile = normalizeModelProfile(options.profile ?? "default");
  const capabilities = createModelCapabilities({
    toolCalls: true,
    cancellation: true,
    maxInputBytes: options.maxInputBytes ?? DEFAULT_MAX_INPUT_BYTES,
    maxOutputBytes: options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES,
  });
  let turns: readonly ModelTurn[] = [];
  let nextTurn = 0;
  const calls: FakeModelCall[] = [];

  const script = (value: readonly ModelTurn[]): void => {
    if (!Array.isArray(value)) throw new TypeError("Fake model script must be an array");
    turns = Object.freeze(value.map((turn) => createModelTurn(turn, capabilities.maxOutputBytes)));
    nextTurn = 0;
    calls.length = 0;
  };
  const reset = (): void => {
    nextTurn = 0;
    calls.length = 0;
  };
  const inspect = (): readonly FakeModelCall[] => Object.freeze([...calls]);
  const request = async (value: ModelRequest): Promise<ModelTurn> => {
    if (normalizeModelProfile(value.profile) !== profile) {
      throw new FakeModelError(
        "ZSYS_FAKE_MODEL_PROFILE_MISMATCH",
        `Fake model profile must be ${profile}`,
      );
    }
    if (value.inputBytes > capabilities.maxInputBytes) {
      throw new RangeError("Fake model request exceeds maxInputBytes");
    }
    const turn = value.signal?.aborted
      ? createModelTurn(
          { type: "cancelled", reason: "request-cancelled" },
          capabilities.maxOutputBytes,
        )
      : turns[nextTurn++];
    if (turn === undefined) {
      throw new FakeModelError("ZSYS_FAKE_MODEL_SCRIPT_EXHAUSTED", "Fake model script exhausted");
    }
    calls.push(
      Object.freeze({
        index: calls.length,
        request: snapshotRequest(value),
        turn,
      }),
    );
    return turn;
  };

  script(options.script ?? []);
  const fake = {
    profile,
    capabilities,
    request,
    script,
    inspect,
    get calls(): readonly FakeModelCall[] {
      return inspect();
    },
    reset,
  } satisfies FakeModelProvider;
  return Object.freeze(fake);
}

export const createFakeModel = createFakeModelProvider;

function snapshotRequest(value: ModelRequest): FakeModelRequest {
  const request = createModelRequest({
    profile: value.profile,
    messages: value.messages,
    tools: value.tools,
    maxInputBytes: value.inputBytes,
    maxOutputBytes: value.maxOutputBytes,
  });
  const { signal: _signal, ...snapshot } = request;
  return snapshot;
}
