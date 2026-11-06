/** Codes reported by agent adapters through RelKit's shared agent loop and tool bridge. */
import type { DiagnosticCodeEntry } from "./codes.types.js";

export const agentAdapterCodes = [
  {
    code: "RELKIT_AGENT_ACCESS_DENIED",
    title: "Agent tool call was refused",
    happened: "The engine's access check refused a tool the agent tried to call.",
    fix: "Check the access rule of the function behind the tool, or call the agent as a caller that the rule allows.",
  },
  {
    code: "RELKIT_AGENT_RESUME_UNAVAILABLE",
    title: "No agent run is waiting",
    happened: "A resume request named a thread that has no run waiting for an approval decision.",
    fix: "Resume only threads whose last run returned the `interrupted` status, and send the decision once.",
  },
  {
    code: "RELKIT_AGENT_RUN_FAILED",
    title: "Agent run failed",
    happened: "The agent adapter stopped with an error that has no more specific code.",
    fix: "Read the server log for the adapter's error, then check the model profile and the agent's tools.",
  },
  {
    code: "RELKIT_AGENT_RUN_PENDING",
    title: "Agent thread is waiting for approval",
    happened:
      "A new run started on a thread whose previous run is still waiting for an approval decision.",
    fix: "Approve or deny the pending tool call with a resume request before starting another run on the thread.",
  },
  {
    code: "RELKIT_AGENT_TOOL_DENIED",
    title: "Agent tool call was denied",
    happened: "Someone denied the approval that the tool call needed, so the tool did not run.",
    fix: "Nothing is broken. Approve the call next time if it should run, or change the tool's approval policy.",
  },
  {
    code: "RELKIT_AGENT_TOOL_FAILED",
    title: "Agent tool call failed",
    happened: "The function behind a tool the agent called failed without a declared error.",
    fix: "Open the trace of the tool's function to see why it failed, then fix the function or its input.",
  },
  {
    code: "RELKIT_AGENT_TOOL_UNKNOWN",
    title: "Agent called an unknown tool",
    happened: "The model asked for a tool that the agent does not declare.",
    fix: "List the tool in the agent's `tools`, or make the instructions name only the tools the agent has.",
  },
] as const satisfies readonly DiagnosticCodeEntry[];
