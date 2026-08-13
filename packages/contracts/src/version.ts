/** Current version of the public contract payloads. */
export const CONTRACT_VERSION = 1 as const;

/** Current version of generated ZSys artifacts. */
export const GENERATOR_VERSION = 1 as const;

/** Current version of the canonical application graph. */
export const GRAPH_VERSION = 1 as const;

/** Current version of the executable runtime manifest. */
export const MANIFEST_VERSION = 1 as const;

/** Current version of the internal inspector/API protocol. */
export const API_VERSION = 1 as const;

/** Shared protocol version used by versioned internal contracts. */
export const PROTOCOL_VERSION = API_VERSION;

export const API_BASE_PATH = "/_zsys/v1" as const;
