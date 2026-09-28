import type { ServerTriggerOptions } from "./trigger.types.js";
/** Validated trigger options with an optional authored job selector. */
export type CopiedTriggerOptions = ServerTriggerOptions & { readonly job?: unknown };
