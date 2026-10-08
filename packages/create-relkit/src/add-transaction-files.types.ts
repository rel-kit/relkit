/** Bytes and mode owned by one transaction, or an absent path that rollback must remove. */
export interface FileSnapshot {
  readonly path: string;
  readonly content?: Uint8Array;
  readonly mode?: number;
}
