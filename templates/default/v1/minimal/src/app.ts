import { defineApp } from "@zsys/app";
import env from "./env.js";

export default defineApp({
  id: "my-app",
  env,
  providers: {},
  observability: { bodyCapture: { mode: "off" } },
});
