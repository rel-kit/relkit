/** Application events use the supported filesystem provider, which has no Docker recipe. */
import { defineApp, defineEnv } from "@relkit/app/config";
import { localEvent } from "@relkit/local";

export default defineApp({
  env: defineEnv({}),
  event: localEvent(),
  defaults: { event: "default" },
});
