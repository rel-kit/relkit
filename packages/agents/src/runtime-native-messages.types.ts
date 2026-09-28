/** Mutable text parts for one native assistant message. */
export interface MessageState {
  readonly messageId: string;
  readonly createdAt: string;
  readonly parts: Map<number, string>;
}
