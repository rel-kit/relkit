/** Private bridge endpoints, shared by the bridge handler and the generated API reference. */

/** Prefix of every endpoint the bridge answers itself instead of forwarding. */
export const INSPECTION_BRIDGE_BASE_PATH = "/_relkit/bridge/v1" as const;

/** Authenticated session handshake. */
export const INSPECTION_HANDSHAKE_PATH = `${INSPECTION_BRIDGE_BASE_PATH}/handshake` as const;

/** Bounded record collection and its acknowledgement. */
export const INSPECTION_RECORDS_PATH = `${INSPECTION_BRIDGE_BASE_PATH}/records` as const;
export const INSPECTION_ACK_PATH = `${INSPECTION_BRIDGE_BASE_PATH}/ack` as const;

/** Every endpoint the bridge answers itself, with what it does. */
export const INSPECTION_BRIDGE_ENDPOINTS = Object.freeze([
  {
    method: "GET",
    path: INSPECTION_HANDSHAKE_PATH,
    summary: "Prove the session's project, session and generation identity",
  },
  {
    method: "GET",
    path: INSPECTION_RECORDS_PATH,
    summary: "Read buffered logs, requests and spans after a cursor (`?after=`)",
  },
  {
    method: "POST",
    path: INSPECTION_ACK_PATH,
    summary: "Acknowledge records through a cursor so the buffer can release them",
  },
] as const);
