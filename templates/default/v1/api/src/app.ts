import { defineApp, eventBridge, managed } from "@zsys/app";
import env from "./env.js";

export default defineApp({
  id: "my-app",
  env,
  providers: {
    events: {
      default: managed(
        eventBridge({
          region: env.EVENT_REGION,
          endpoint: env.EVENT_ENDPOINT,
          busName: env.EVENT_BUS_NAME,
        }),
      ),
    },
  },
  observability: { bodyCapture: { mode: "off" } },
});
