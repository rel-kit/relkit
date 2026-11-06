import { Schema } from "effect";

/** Thread IDs reject empty values and surrounding whitespace without normalizing identities. */
export const AgentThreadId = Schema.String.check(Schema.isMinLength(1), Schema.isTrimmed());
