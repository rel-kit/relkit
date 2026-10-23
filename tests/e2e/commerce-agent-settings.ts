/** Pure browser-fixture configuration keeps public transport security and explicit local provider borrowing unchanged. */
import type { AgentStateProvider } from "../../packages/agents/src/index.ts";
import type { RealtimeProvider } from "../../packages/realtime/src/index.ts";
import type { CreateAppOptions } from "../../packages/runtime-hono/src/index.ts";
import { playwrightSelection } from "../../scripts/playwright-selection.js";

/**
 * Composes native runtime policies without opening a client, listener or state journal.
 * @param provider - Borrowed native agent-state provider.
 * @param realtimeProvider - Borrowed native realtime provider.
 * @param publicFingerprint - Actual generated public-contract identity.
 * @returns Existing identity, agent, realtime and browser security settings.
 */
export function commerceAgentRuntimeSettings(
  provider: AgentStateProvider,
  realtimeProvider: RealtimeProvider,
  publicFingerprint: string,
) {
  return {
    agUi: true,
    clientIdentity: {
      applicationId: "commerce-api",
      publicFingerprint,
      resolve: () => ({
        identityScope: "commerce-browser",
        sessionEpoch: "commerce-browser-session",
        setCookies: ["relkit_csrf=commerce-browser-csrf; Path=/; SameSite=Lax"],
      }),
    },
    agentRuntime: {
      applicationId: "commerce-api",
      environment: "test",
      generationId: "commerce-browser-generation",
      publicFingerprint,
      provider: () => provider,
    },
    realtime: {
      applicationId: "commerce-api",
      environment: "test",
      provider: () => realtimeProvider,
    },
    transportSecurity: {
      allowedOrigins: [playwrightSelection("commerce").ui],
      validateCsrf: (_request: Request, token: string | undefined) =>
        token === "commerce-browser-csrf",
    },
  } satisfies Pick<
    CreateAppOptions,
    "agUi" | "clientIdentity" | "agentRuntime" | "realtime" | "transportSecurity"
  >;
}
