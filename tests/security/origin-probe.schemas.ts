/** Decodes original saved native security observations before assertions; optional diagnostic fields remain in the retained file. */
import { Schema } from "effect";

/** Requires the real selected origin and original HTTP/WebSocket denial observations. */
export const originProbeResult = Schema.Struct({
  base: Schema.String,
  http: Schema.Struct({ status: Schema.Number, id: Schema.String }),
  websocket: Schema.Struct({ opened: Schema.Boolean }),
});
