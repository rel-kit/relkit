import type {
  EventAdminMode,
  EventAdminAction,
  EventAdminActionOutcome,
  EventAdminVersion,
  EventVersioned,
  EventContractInput,
  EventContract,
  EventTriggerContract,
  EventPublicationContract,
  EventDeliveryContract,
  EventDeadLetterContract,
  EventTriggerCapabilityContract,
  EventQueryRequest,
  EventQueryContract,
  EventAdminActionRequest,
  EventRetryRequest,
  EventAdminActionRecord,
  EventAdminActionContract,
  EventAdminActionSink,
} from "./admin-contracts.types.js";
import { PROTOCOL_VERSION } from "@relkit/contracts";

export type {
  EventAdminMode,
  EventAdminAction,
  EventAdminActionOutcome,
  EventAdminVersion,
  EventVersioned,
  EventContractInput,
  EventContract,
  EventTriggerContract,
  EventPublicationContract,
  EventDeliveryContract,
  EventDeadLetterContract,
  EventTriggerCapabilityContract,
  EventQueryRequest,
  EventQueryContract,
  EventAdminActionRequest,
  EventRetryRequest,
  EventAdminActionRecord,
  EventAdminActionContract,
  EventAdminActionSink,
} from "./admin-contracts.types.js";

export const EVENT_ADMIN_PROTOCOL = "relkit.events.admin" as const;
export const EVENT_ADMIN_VERSION = PROTOCOL_VERSION;
