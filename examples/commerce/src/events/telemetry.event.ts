import { events, onEvent } from "@relkit/app/events";

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
