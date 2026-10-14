/** Describes finite command parsing state and recognized shell operands. */
export interface LayoutShellState {
  command: string | undefined;
  previous: string;
  scriptSeen: boolean;
}
export type LayoutShellToken =
  | { readonly kind: "ignored" }
  | {
      readonly kind: "operand";
      readonly value: string;
      readonly quoted: boolean;
      readonly supported: boolean;
    };
