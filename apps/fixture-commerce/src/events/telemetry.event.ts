import { events, onEvent } from "@zsys/app";
import captureEventTelemetry from "../functions/capture-event-telemetry.function.js";

const telemetry = onEvent(events.all({ payload: "unknown", purpose: "telemetry" }), {
  id: "telemetry.capture-events",
  target: captureEventTelemetry,
  delivery: "ephemeral",
  profile: "default",
  tags: ["telemetry"],
});

export default telemetry;
