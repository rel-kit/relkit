/** Injects one before/after native provider or checkpointer fault while retaining actual operations. */
import { MemorySaver } from "@langchain/langgraph";
import { type AgentStateProvider, type ExecutionClaim } from "@relkit/agents";

export type ProviderMethod = "appendJournal" | "completeRun" | "suspendRun" | "admitContinuation";
export type Phase = "before" | "after";

export function faultSaver(saver: MemorySaver, phase: Phase): MemorySaver {
  let armed = true;
  return new Proxy(saver, {
    get(target, key) {
      const value = Reflect.get(target, key, target);
      if (typeof value !== "function") return value;
      const invoke = value.bind(target);
      if (key !== "put") return invoke;
      return async (...args: unknown[]) => {
        if (armed && phase === "before") {
          armed = false;
          throw new Error("checkpoint before");
        }
        const result = await invoke(...args);
        if (armed && phase === "after") {
          armed = false;
          throw new Error("checkpoint after");
        }
        return result;
      };
    },
  });
}

export function faultProvider(
  provider: AgentStateProvider,
  method: ProviderMethod,
  phase: Phase,
): AgentStateProvider {
  let armed = true;
  const invoke = (provider[method] as (...args: any[]) => Promise<unknown>).bind(provider);
  return {
    ...provider,
    [method]: async (...args: any[]) => {
      if (armed && phase === "before") {
        armed = false;
        throw new Error(`${method} before`);
      }
      const result = await invoke(...args);
      if (armed && phase === "after") {
        armed = false;
        throw new Error(`${method} after`);
      }
      return result;
    },
  } as AgentStateProvider;
}

export function captureClaims(
  provider: AgentStateProvider,
  claims: ExecutionClaim[],
): AgentStateProvider {
  return {
    ...provider,
    claimRun: async (request) => {
      const claim = await provider.claimRun(request);
      claims.push(claim);
      return claim;
    },
  };
}
