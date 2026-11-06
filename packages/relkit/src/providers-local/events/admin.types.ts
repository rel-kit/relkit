import type {
  EVENT_ADMIN_PROTOCOL,
  EVENT_ADMIN_VERSION,
  EventAdminActionContract,
  EventAdminActionRecord,
  EventAdminActionRequest,
  EventAdminActionSink,
  EventAdminMode,
  EventQueryContract,
  EventQueryRequest,
} from "./admin-contracts.js";

/** Event administration mode plus isolated audit and clock hooks. */
export interface EventAdminOptions {
  readonly mode?: EventAdminMode;
  readonly environment?: EventAdminMode;
  readonly enabled?: boolean;
  readonly now?: () => number;
  readonly createActionId?: () => string;
  readonly onAction?: EventAdminActionSink;
}

/** Versioned event inspection and audited dead-letter retry interface. */
export interface EventAdmin {
  readonly protocol: typeof EVENT_ADMIN_PROTOCOL;
  readonly version: typeof EVENT_ADMIN_VERSION;
  readonly query: (request?: EventQueryRequest) => EventQueryContract;
  readonly retry: (request: string | EventAdminActionRequest) => Promise<EventAdminActionContract>;
  readonly actions: () => readonly EventAdminActionRecord[];
}
