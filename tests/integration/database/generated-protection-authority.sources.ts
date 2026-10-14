/** Native public descriptor sources test real session ownership, protected/internal realtime and deterministic agent scope without new configuration APIs. */
export const generatedProtectionAuthoritySources = {
  "src/platform/ownership.types.ts": `/** Subject used by native ownership checks independently of physical service paths. */
export interface OwnershipSubject { readonly ownerId: string; readonly tenant: string; }
`,
  "src/platform/session.schemas.ts": `/** Validates native auth session data before application authorization. */
import { z } from "@relkit/app/schema";
export const ownershipSession = z.object({ user: z.object({ id: z.string(), email: z.string() }) });
`,
  "src/platform/ownership.ts": `/** Guards the original trusted native auth context before inspecting current session ownership. */
import { ownershipSession } from "./session.schemas.js";
import type { OwnershipSubject } from "./ownership.types.js";
/**
 * Reads only the native session authority supplied by the admitted request.
 * @param context - Native function context or realtime/agent trusted request context.
 * @returns Validated current session or absence, preserving native session failure.
 */
export async function nativeSession(context: object) {
  const auth = Reflect.get(context, "auth");
  if (typeof auth !== "object" || auth === null || !("getSession" in auth) || typeof auth.getSession !== "function") return null;
  const result = await ownershipSession.safeParse(await auth.getSession({ fresh: true }));
  return "value" in result ? result.value : null;
}
/**
 * Requires the same current user and tenant at every native invocation edge.
 * @param subject - Validated requested subject.
 * @param context - Original native session authority.
 * @returns Whether the current user owns the requested subject in the requested tenant.
 */
export async function owns(subject: OwnershipSubject, context: object): Promise<boolean> {
  const session = await nativeSession(context);
  return session !== null && session.user.id === subject.ownerId && session.user.email.split("@")[1] === subject.tenant;
}
`,
  "src/services/ownership/channels/feed.channel.ts": `/** Protected native channel preserves partition, replay and presence policy across a physical source move. */
import { defineChannel } from "@relkit/app/realtime";
import { z } from "@relkit/app/schema";
import { owns } from "@app/platform/ownership.js";
export default defineChannel({ id: "ownership.feed", params: z.object({ ownerId: z.string(), tenant: z.string() }), events: { changed: z.object({ message: z.string() }) },
  client: { authorize: (params, context) => typeof context === "object" && context !== null ? owns(params, context) : false },
  replay: { retentionMs: 300000, maxEvents: 100 }, presence: "count",
});
`,
  "src/services/ownership/channels/internal.channel.ts": `/** Internal channel stays unavailable to public client procedures in either layout. */
import { defineChannel } from "@relkit/app/realtime";
import { z } from "@relkit/app/schema";
export default defineChannel({ id: "ownership.internal", params: z.object({}), events: { changed: z.string() } });
`,
  "src/services/ownership/agents/assistant.agent.ts": `/** Protected offline native agent keeps browser thread state scoped to its actual authenticated identity. */
import { defineAgent } from "@relkit/app/agents";
import { z } from "@relkit/app/schema";
import { FakeToolCallingModel } from "langchain";
import { nativeSession } from "@app/platform/ownership.js";
export default defineAgent({ id: "ownership.assistant", input: z.object({ message: z.string().min(1) }), output: z.object({ answer: z.string() }),
  model: new FakeToolCallingModel({ toolCalls: [[{ name: "relkit_output", args: { value: { answer: "Offline owned response" } }, id: "owned-output" }]] }),
  instructions: "Return only the controlled offline response", tools: [], stateProfile: "default", chat: { input: "message", output: "answer" },
  client: { authorize: async (_request, context) => typeof context === "object" && context !== null && await nativeSession(context) !== null },
  limits: { maxSteps: 2, maxToolCalls: 1, timeoutMs: 5000 },
});
`,
} as const;
