import { defineRoute } from "@zsys/app";
import { betterAuthAdapter } from "@zsys/better-auth";
import { auth } from "../../../../auth.js";

export const ALL = defineRoute({
  handler: betterAuthAdapter(auth, { protected: ["/account/*", "/mcp"] }),
});
