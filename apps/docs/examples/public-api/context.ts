/** Declares shared context values and resolves them without starting an HTTP server or model. */
import {
  createApplicationContextResolver,
  defineConstants,
  defineEnv,
  definePrompt,
  env,
} from "@relkit/app";

const environment = defineEnv({ REGION: env.string() });
export const limits = defineConstants(
  { maxItems: 20, region: environment.REGION },
  { id: "orders.constants" },
);
export const supportPrompt = definePrompt(
  ["Answer using the order details.", "Do not invent delivery dates."],
  { id: "support.prompt" },
);

export const contextResolver = createApplicationContextResolver({
  env: { REGION: "eu-west-1" },
  constants: { orders: limits },
  prompts: { support: supportPrompt },
});
