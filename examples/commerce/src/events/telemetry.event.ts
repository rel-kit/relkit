import { events, onEvent } from "@zsys/app";

const telemetry = onEvent(
  events.all({ payload: "unknown", purpose: "telemetry" }),
  async (envelope) => envelope,
  {
    id: "telemetry.capture-events",
    delivery: "ephemeral",
    profile: "default",
    tags: ["telemetry"],
  },
);

export default telemetry;
