import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { activateBetterAuthService } from "@relkit/better-auth";
import { activateDrizzleService } from "@relkit/drizzle";
import { createHttpAuthRuntime, type HttpAuthRuntime } from "@relkit/runtime-hono";
import type { TestRawRoute, TestRoute } from "./application-routes.js";

export interface TestApplicationServices {
  readonly context: Readonly<Record<string, unknown>>;
  readonly auth?: HttpAuthRuntime;
  readonly close: () => Promise<void>;
}

export async function activateTestServices(
  root: string,
  env: Readonly<Record<string, unknown>>,
  routes: readonly TestRoute[],
): Promise<TestApplicationServices> {
  const services = await loadServices(root);
  const databaseService = soleCapability(services, "drizzle");
  const authService = soleCapability(services, "better-auth");
  const database =
    databaseService === undefined
      ? undefined
      : await activateDrizzleService(databaseService as never, env);
  const mount = routes.find(isAuthMount);
  if (authService !== undefined && (database === undefined || mount === undefined)) {
    await database?.close();
    throw new Error("Better Auth tests require one Drizzle service and one auth ALL route");
  }
  const activeAuth =
    authService === undefined
      ? undefined
      : await activateBetterAuthService(authService as never, database as never, basePath(mount!));
  const auth =
    activeAuth === undefined || mount === undefined
      ? undefined
      : createHttpAuthRuntime({
          protected: mount.auth?.protected ?? [],
          publicPaths: [basePath(mount), mount.path],
          getSession: async (headers) => (await activeAuth.api.getSession({ headers })) ?? null,
        });
  let closing: Promise<void> | undefined;
  return Object.freeze({
    context: Object.freeze({
      ...(database === undefined ? {} : { database: database.context }),
    }),
    ...(auth === undefined ? {} : { auth }),
    close: () => (closing ??= database?.close() ?? Promise.resolve()),
  });
}

async function loadServices(root: string): Promise<readonly Record<string, any>[]> {
  const source = join(root, "src");
  const files = [...new Bun.Glob("*/service.ts").scanSync({ cwd: source, onlyFiles: true })];
  const services: Record<string, any>[] = [];
  for (const file of files.sort()) {
    const module = (await import(pathToFileURL(join(source, file)).href)) as Record<
      string,
      unknown
    >;
    for (const value of Object.values(module)) {
      if (isRecord(value) && value.kind === "service") services.push(value);
    }
  }
  return services;
}

function soleCapability(
  services: readonly Record<string, any>[],
  kind: "drizzle" | "better-auth",
): Record<string, any> | undefined {
  const matches = services.filter((service) => service.capability?.kind === kind);
  if (matches.length > 1) throw new Error(`Test application has multiple ${kind} services`);
  return matches[0];
}

function isAuthMount(route: TestRoute): route is TestRawRoute {
  return route.method === "ALL" && "handler" in route && route.auth !== undefined;
}

function basePath(route: TestRawRoute): string {
  return route.path.replace(/\/\*[^/]+\??$/, "");
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
