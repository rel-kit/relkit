import { Schema } from "effect";

/** A rejected event or event-function descriptor with a stable typed tag.
 * @example new EventDefinitionError({ message: "Invalid event descriptor" })
 */
export class EventDefinitionError extends Schema.TaggedError<EventDefinitionError>()(
  "EventDefinitionError",
  { message: Schema.String },
) {}

/** A rejected function-to-event binding with a stable typed tag.
 * @example new EventBindingError({ message: "Missing event contract" })
 */
export class EventBindingError extends Schema.TaggedError<EventBindingError>()(
  "EventBindingError",
  { message: Schema.String },
) {}
