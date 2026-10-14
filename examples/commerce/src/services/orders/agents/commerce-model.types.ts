/** Closed deterministic model modes and native tool argument domains for the commerce demo. */
export type CommerceModelMode = "support" | "deep";
export type CommerceToolArguments =
  | { readonly todos: readonly { readonly content: string; readonly status: string }[] }
  | { readonly orderId: string }
  | { readonly value: { readonly answer: string } }
  | { readonly description: string; readonly subagent_type: string };
