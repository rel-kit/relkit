import type { DrizzleActivation, DrizzleServiceDescriptor } from "@relkit/drizzle/internal";
import type { Auth } from "better-auth";
import type { BetterAuthServiceDescriptor, BetterAuthServiceOptions } from "./types.js";

export const BETTER_AUTH_HANDLER = Symbol.for("relkit.better-auth.handler");
const BETTER_AUTH_RUNTIME = Symbol.for("relkit.better-auth.runtime");

export interface BetterAuthRuntime<Options extends BetterAuthServiceOptions> {
  readonly options: Options;
  activation: Promise<Auth<any>> | undefined;
}

export function runtimeOf<Options extends BetterAuthServiceOptions>(
  service: BetterAuthServiceDescriptor<Options>,
): BetterAuthRuntime<Options> {
  const runtime = (service as unknown as Record<PropertyKey, unknown>)[BETTER_AUTH_RUNTIME];
  if (!isRecord(runtime)) throw new TypeError("Invalid Better Auth service descriptor");
  return runtime as unknown as BetterAuthRuntime<Options>;
}

export function attachRuntime<Options extends BetterAuthServiceOptions>(
  service: BetterAuthServiceDescriptor<Options>,
  runtime: BetterAuthRuntime<Options>,
): void {
  Object.defineProperty(service, BETTER_AUTH_RUNTIME, { value: runtime });
}

export function databaseServiceOf(
  activation: DrizzleActivation<DrizzleServiceDescriptor<any, any, any, any>>,
): DrizzleServiceDescriptor<any, any, any, any> {
  const service = (activation as unknown as Record<PropertyKey, unknown>)[
    Symbol.for("relkit.drizzle.service")
  ];
  if (!isRecord(service)) throw new TypeError("Drizzle activation is missing its service");
  return service as DrizzleServiceDescriptor<any, any, any, any>;
}

function isRecord(value: unknown): value is Record<PropertyKey, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
