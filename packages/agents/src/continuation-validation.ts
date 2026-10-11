/**
 * Exposes graph identity and continuation validators to transport adapters without
 * importing the agent execution barrel. Validation remains owned by its existing
 * implementations and preserves their public failure and reply contracts.
 */
export { isGraphDescriptor } from "./define-graph.js";
export { validateGraphResumeInput } from "./graph-continuation-validation.js";
export { validateNativeAgentResumeInput } from "./native-agent-interruption.js";
