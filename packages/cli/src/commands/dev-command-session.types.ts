/** Accepted command state shared by support/session composition; no resource lifetime is transferred by these types. */
import type { Effect, Ref } from "effect";
import type { TelemetryConfiguration } from "@relkit/observability";
import type { CliCommandContext } from "../main-support-types.js";
import type { ProjectArgs } from "./project-args.types.js";
import type { developmentPortsEffect } from "./dev-inspector.js";
import type { checkInitialDevProjectEffect } from "./dev-initial-check.js";
import type { acquireDevCommandSupport } from "./dev-command-support.js";

/** Per-command state; initial watches remain within the enclosing command Scope. */
export interface DevCommandSessionState {
  readonly options: ProjectArgs;
  readonly projectRoot: string;
  readonly context: CliCommandContext;
  readonly ports: Effect.Success<ReturnType<typeof developmentPortsEffect>>;
  readonly terminal: { readonly color: boolean; readonly verbose: boolean };
  readonly initial: Effect.Success<ReturnType<typeof checkInitialDevProjectEffect>>;
  readonly configuration: Ref.Ref<TelemetryConfiguration>;
}

/** Dependencies acquired before supervisor startup and released by its session Scope. */
export type DevCommandSupport = Effect.Success<ReturnType<typeof acquireDevCommandSupport>>;
