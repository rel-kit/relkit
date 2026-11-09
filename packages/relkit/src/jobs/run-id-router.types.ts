import type { RunLocatorKeyRing } from "./run-id.types.js";
/** One retained service generation and its locator verification keys. */
export interface RunLocatorGeneration {
  readonly generation: string;
  readonly keyRing: RunLocatorKeyRing;
}
/** Replaceable persistence boundary for locator generations. */
export interface RunLocatorGenerationStore {
  readonly load: () => readonly RunLocatorGeneration[] | Promise<readonly RunLocatorGeneration[]>;
  readonly save: (generations: readonly RunLocatorGeneration[]) => void | Promise<void>;
}
