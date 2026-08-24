import {
  defineAgent,
  defineApp,
  defineBucket,
  defineCache,
  defineEnv,
  defineError,
  defineEvent,
  defineFunction,
  defineJob,
  defineMiddleware,
  defineRoute,
  defineService,
  defineServiceMiddleware,
  defineTool,
  defineTransform,
  http,
} from "@zsys/app";
import { z } from "@zsys/schema";

const input = z.object({ id: z.string() });
const output = z.object({ ok: z.boolean() });
const target = defineFunction({ input, output, handler: async () => ({ ok: true }) });

const optionalFunction = defineFunction({ input, output, handler: async () => ({ ok: true }) });
const optionalError = defineError({ data: input, message: "Invalid" });
const optionalDelayedError = defineError({
  data: input,
  message: "Retry later",
  retry: { kind: "later", afterMs: 1_000 },
});
const optionalRoute = defineRoute({ target });
const optionalMiddleware = defineMiddleware("/orders/*", async (_context, next) => next());
const optionalTransform = defineTransform({ schema: z.string() });
const optionalServiceMiddleware = defineServiceMiddleware({
  handler: async (_value, next) => next(),
});
const optionalService = defineService({
  functions: { get: target },
  middleware: [optionalServiceMiddleware],
});
const optionalTool = defineTool({
  target,
  description: "Read an order",
  sideEffect: "read",
  approval: "never",
});
const optionalAgent = defineAgent({
  input,
  output,
  model: "default",
  instructions: "Answer safely.",
  tools: [optionalTool],
  limits: { maxSteps: 1, maxToolCalls: 1, timeoutMs: 1_000 },
});

const explicitFunction = defineFunction({
  id: "types.explicit",
  input,
  output,
  handler: async () => ({ ok: true }),
});
const explicitId: "types.explicit" = explicitFunction.id;
const optionalId: string = optionalFunction.id;
const optionalErrorId: string = optionalError.id;
const normalizedErrorRetry: "never" | "later" = optionalError.retry;
const normalizedDelayedErrorRetry: "never" | "later" = optionalDelayedError.retry;
const normalizedDelayedErrorAfterMs: number | undefined = optionalDelayedError.afterMs;
const optionalRouteId: string = optionalRoute.id;
const optionalMiddlewareId: string = optionalMiddleware.id;
const optionalTransformId: string = optionalTransform.id;
const optionalServiceMiddlewareId: string = optionalServiceMiddleware.id;
const optionalServiceId: string = optionalService.id;
const optionalToolId: string = optionalTool.id;
const optionalAgentId: string = optionalAgent.id;
void explicitId;
void optionalId;
void optionalErrorId;
void normalizedErrorRetry;
void normalizedDelayedErrorRetry;
void normalizedDelayedErrorAfterMs;
void optionalRouteId;
void optionalMiddlewareId;
void optionalTransformId;
void optionalServiceMiddlewareId;
void optionalServiceId;
void optionalToolId;
void optionalAgentId;

// Durable application and managed-resource identities remain required.
// @ts-expect-error app IDs are mandatory
defineApp({ env: defineEnv({}), providers: {} });
// @ts-expect-error event IDs are mandatory
defineEvent({ version: 1, payload: input });
// @ts-expect-error job IDs are mandatory
defineJob({
  input,
  target,
  retry: { maxAttempts: 1, initialDelayMs: 0, maxDelayMs: 0, multiplier: 1, jitter: "none" },
});
// @ts-expect-error bucket IDs are mandatory
defineBucket({ visibility: "private" });
// @ts-expect-error cache IDs are mandatory
defineCache({ key: input, value: output });
