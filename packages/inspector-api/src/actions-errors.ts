import { Schema } from "effect";

/** Public positional action error with a schema-backed internal tag and unchanged envelope. */
export class InspectorActionError extends Schema.TaggedError<InspectorActionError>()(
  "InspectorActionError",
  {
    code: Schema.String,
    status: Schema.Number,
    body: Schema.UndefinedOr(Schema.Record(Schema.String, Schema.Unknown)),
    message: Schema.String,
  },
) {
  constructor(code: string, status: number, body?: Record<string, unknown>) {
    super({ code, status, body, message: code });
    this.name = "InspectorActionError";
  }
}
