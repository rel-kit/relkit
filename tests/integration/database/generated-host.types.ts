/** Derives the exact owned host operation contract from its native Effect construction without weakening error or dependency channels. */
import type { Effect } from "effect";
import type { startGeneratedHost } from "./generated-host.service.js";

/** Original generated-host session operations and addresses, retained only for their owner's scope. */
export type GeneratedHostSession = Effect.Success<ReturnType<typeof startGeneratedHost>>;
