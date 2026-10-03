import { Schema } from "effect";

/** Supported native response encodings; each retains its established wire representation. */
export const NativeStreamFormat = Schema.Literals(["sse", "text", "bytes"]);

/** Text stream elements require strings; no implicit object coercion is allowed. */
export const TextStreamItem = Schema.String;
