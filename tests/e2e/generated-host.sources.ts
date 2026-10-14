/** Controlled public SDK source for browser AI/realtime validation, using an offline native model and explicit local provider configuration. */
export const generatedBrowserSources = {
  "src/services/validation/service.ts": `/** Owns the controlled validation channel beneath a useful native service boundary. */
import { defineService } from "@relkit/app/services";
import ping from "./functions/ping.function.js";
export default defineService({ functions: { ping } });
`,
  "src/services/validation/functions/ping.function.ts": `/** Useful function retains an explicit compiler-resolvable native identity. */
import { defineFunction } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";
export default defineFunction({ id: "validation.ping", input: z.object({}), output: z.string(), handler: async () => "ready" });
`,
  "relkit.config.ts": `/** Explicit local providers for the controlled browser acceptance application. */
import { defineApp, defineEnv } from "@relkit/app/config";
import { localAgentState, localRealtime } from "@relkit/local";
export default defineApp({ id: "browser-generated-host", env: defineEnv({}),
  realtime: localRealtime(), "agent-state": localAgentState(),
  defaults: { realtime: "default", "agent-state": "default" },
});
`,
  "src/services/hello/agents/consumer.agent.ts": `/** Public offline agent whose declared input is validated before model execution. */
import { defineAgent } from "@relkit/app/agents";
import { z } from "@relkit/app/schema";
import { FakeToolCallingModel } from "langchain";
export default defineAgent({ id: "hello.consumer",
  input: z.object({ message: z.string().min(1) }), output: z.object({ answer: z.string() }),
  model: new FakeToolCallingModel({ toolCalls: [[{ name: "relkit_output", args: { value: { answer: "Offline response" } }, id: "offline-output" }]] }),
  instructions: "Return the controlled offline response", tools: [], stateProfile: "default",
  client: { public: true }, limits: { maxSteps: 2, maxToolCalls: 1, timeoutMs: 5000 },
});
`,
  "src/services/validation/channels/validation.channel.ts": `/** Public channel rejects non-string partitions through the original realtime contract. */
import { defineChannel } from "@relkit/app/realtime";
import { z } from "@relkit/app/schema";
export default defineChannel({ id: "validation.feed", params: z.object({ topic: z.string() }),
  events: { posted: z.object({ message: z.string() }) }, client: { public: true },
});
`,
} as const;
