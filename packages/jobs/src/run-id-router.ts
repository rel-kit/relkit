import {
  RunLocatorError,
  validateRunLocatorKeyRing,
  verifyRunLocator,
  type RunLocatorKeyRing,
  type RunLocatorVerifyOptions,
  type VerifiedRunLocator,
} from "./run-id.js";

export interface RunLocatorGeneration {
  readonly generation: string;
  readonly keyRing: RunLocatorKeyRing;
}

export interface RunLocatorGenerationStore {
  readonly load: () => readonly RunLocatorGeneration[] | Promise<readonly RunLocatorGeneration[]>;
  readonly save: (generations: readonly RunLocatorGeneration[]) => void | Promise<void>;
}

export class RunLocatorRouter {
  private readonly generations = new Map<string, RunLocatorKeyRing>();

  constructor(generations: readonly RunLocatorGeneration[] = []) {
    for (const entry of generations) this.register(entry.generation, entry.keyRing);
  }

  static async fromStore(store: RunLocatorGenerationStore): Promise<RunLocatorRouter> {
    return new RunLocatorRouter(await store.load());
  }

  register(generation: string, keyRing: RunLocatorKeyRing): void {
    if (!/^[A-Za-z0-9._-]{1,256}$/u.test(generation)) throw new RunLocatorError();
    validateRunLocatorKeyRing(keyRing);
    this.generations.set(generation, keyRing);
  }

  snapshot(): readonly RunLocatorGeneration[] {
    return Object.freeze(
      [...this.generations.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([generation, keyRing]) => Object.freeze({ generation, keyRing })),
    );
  }

  async persist(store: RunLocatorGenerationStore): Promise<void> {
    await store.save(this.snapshot());
  }

  route(locator: string, options: Omit<RunLocatorVerifyOptions, "keyRing"> = {}): VerifiedRunLocator {
    for (const [generation, keyRing] of this.generations) {
      try {
        const verified = verifyRunLocator(locator, { ...options, keyRing });
        if (verified.serviceGeneration === generation) return verified;
      } catch {
        // Historical generations are deliberately tried without exposing which one matched.
      }
    }
    throw new RunLocatorError();
  }
}
