import type { RuntimeProviderContext, RuntimeProviderIntegration } from "@relkit/provider";
import { createAiSdkModelProvider } from "./model.js";

export * from "./model.js";

export const runtimeIntegration = Object.freeze({
  kind: "runtime-integration",
  integrationId: "ai-sdk",
  registrations: Object.freeze([
    {
      capability: "model",
      adapterId: "ai-sdk",
      protocolVersion: 1,
      create: async ({ profile, connection, behavior }: RuntimeProviderContext) => ({
        value: await createAiSdkModelProvider({
          profile,
          connection: {
            apiKey: text(connection.apiKey, "AI SDK apiKey"),
            ...optionalText(connection, "baseURL"),
            ...optionalText(connection, "organization"),
            ...optionalText(connection, "project"),
          },
          behavior: behavior as {
            readonly provider: "openai" | "anthropic";
            readonly defaultModel: string;
          },
        }),
      }),
    },
  ]),
}) satisfies RuntimeProviderIntegration<"ai-sdk">;

function optionalText(
  source: Readonly<Record<string, unknown>>,
  name: "baseURL" | "organization" | "project",
): Partial<Record<typeof name, string>> {
  return source[name] === undefined ? {} : { [name]: text(source[name], `AI SDK ${name}`) };
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${label} is invalid`);
  return value;
}
