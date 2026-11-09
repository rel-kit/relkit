/** Current version of the public contract payloads. */
export const CONTRACT_VERSION = 7 as const;

/** Current version of generated RelKit artifacts. */
export const GENERATOR_VERSION = 7 as const;

/** Current version of the canonical application graph. */
export const GRAPH_VERSION = 10 as const;

/** Current version of the executable runtime manifest. */
export const MANIFEST_VERSION = 10 as const;

/** Current version of the internal inspector/API protocol. */
export const API_VERSION = 1 as const;

/** Shared protocol version used by versioned internal contracts. */
export const PROTOCOL_VERSION = API_VERSION;

export const API_BASE_PATH = "/_relkit/v1" as const;

export const AGENT_STREAM_PROTOCOL = "relkit.agent-stream" as const;
export const AGENT_STREAM_VERSION = 2 as const;
export const AGENT_STATE_SCHEMA_VERSION = 2 as const;
export const AGENT_CAPABILITY_HEADER = "x-relkit-agent-capabilities" as const;
export const AGENT_CAPABILITY_QUERY = "relkitCapabilities" as const;
export const AGENT_STREAM_CAPABILITIES = Object.freeze([
  "relkit.agent-stream.v2",
  "canonical-scoped-events.v1",
  "public-state.v1",
  "cursor-replay.v1",
  "native-checkpoints.v1",
] as const);
export const AGENT_CAPABILITY_VALUE = AGENT_STREAM_CAPABILITIES.join(",");
export const AGENT_PROTOCOL_CAPABILITY = Object.freeze({
  protocol: AGENT_STREAM_PROTOCOL,
  version: AGENT_STREAM_VERSION,
  required: AGENT_STREAM_CAPABILITIES,
});
