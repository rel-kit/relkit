/** Native LangGraph agent state access used by continuation operations. */
export type NativeAgent = Pick<ReturnType<typeof import("langchain").createAgent>, "getState">;

/** State lookup configuration accepted by a native agent. */
export type NativeAgentConfig = Parameters<NativeAgent["getState"]>[0];
