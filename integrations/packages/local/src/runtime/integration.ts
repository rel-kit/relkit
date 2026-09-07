import { join } from "node:path";
import { createLocalEventProvider, createLocalJobProvider } from "@relkit/providers-local";
import type { RuntimeProviderContext, RuntimeProviderIntegration } from "@relkit/provider";

export const runtimeIntegration: RuntimeProviderIntegration<"local"> = Object.freeze({
  kind: "runtime-integration",
  integrationId: "local",
  registrations: Object.freeze([
    {
      capability: "event",
      adapterId: "local-event",
      protocolVersion: 1,
      create: async ({ profile, connection }: RuntimeProviderContext) => {
        const provider = await createLocalEventProvider(join(root(connection), "events", profile));
        return { value: provider, release: provider.close };
      },
    },
    {
      capability: "job",
      adapterId: "local-job",
      protocolVersion: 1,
      create: ({ profile, connection }: RuntimeProviderContext) => {
        const provider = createLocalJobProvider(root(connection), profile);
        return { value: provider, release: provider.close };
      },
    },
  ]),
});

function root(connection: Readonly<Record<string, unknown>>): string {
  const value = connection.root;
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError("Local provider root is invalid");
  }
  return value;
}
