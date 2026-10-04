import { Schema } from "effect";

/** Typed invalid transfer boundary translated to the existing public TypeError family. */
export class InvalidTestSnapshot extends Schema.TaggedError<InvalidTestSnapshot>()(
  "InvalidTestSnapshot",
  {
    message: Schema.String,
  },
) {}
