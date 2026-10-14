/** Combines pure hero metadata while retaining each panel's literal source identity. */
import { transportExamples } from "./hero-examples-transport";
import { capabilityExamples } from "./hero-examples-capabilities";
export type { HeroCodePanel, HeroExample } from "./hero-examples.types";

// Hero excerpts omit framework imports and abbreviate app imports to filenames.
export const heroExampleDefinitions = [...transportExamples, ...capabilityExamples] as const;
