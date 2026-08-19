import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  createTestHttpClient,
  createTestObservability,
  type TestHttpClient,
  type TestHttpInput,
  type TestObservability,
} from "./http.js";
import {
  createTestRuntime,
  type TestClock,
  type TestRuntime,
  type TestRuntimeOptions,
} from "./runtime.js";
import { type TestFakes } from "./fakes.js";

export type TestApplicationOptions = Omit<TestRuntimeOptions, "app"> & {
  readonly projectRoot?: string;
};

export interface TestApplication {
  readonly runtime: TestRuntime;
  readonly http: TestHttpClient;
  readonly clock: TestClock;
  readonly fakes: TestFakes;
  readonly observability: TestObservability;
  readonly close: () => Promise<void>;
}

type Route = {
  readonly method: string;
  readonly path: string;
  readonly request: unknown;
  readonly target: Parameters<TestRuntime["invoke"]>[0];
  readonly responses: readonly { readonly kind?: string; readonly status?: number }[];
};

export async function createTestApplication(
  app: { readonly env: object },
  options: TestApplicationOptions = {},
): Promise<TestApplication> {
  const projectRoot = options.projectRoot ?? process.cwd();
  const routes = await loadRoutes(projectRoot);
  const runtime = createTestRuntime({
    app: app as NonNullable<TestRuntimeOptions["app"]>,
    ...options,
  });
  const application = {
    request: async (input: TestHttpInput, init: RequestInit | undefined) =>
      handleRequest(
        routes,
        runtime,
        input instanceof Request
          ? init === undefined
            ? input
            : new Request(input, init)
          : new Request(new URL(input.toString(), "http://zsys.test").toString(), init),
      ),
  };
  const http = createTestHttpClient(application);
  const observability = createTestObservability();
  let closing: Promise<void> | undefined;
  const close = (): Promise<void> =>
    (closing ??= (async () => {
      await http.close();
      await runtime.close();
    })());
  return Object.freeze({
    runtime,
    http,
    clock: runtime.clock,
    fakes: runtime.fakes,
    observability,
    close,
  });
}

async function loadRoutes(root: string): Promise<readonly Route[]> {
  const files = await readdir(join(root, "src", "routes"));
  const routes: Route[] = [];
  for (const file of files.filter((name) => /\.ts$/.test(name)).sort()) {
    const module = (await import(
      `${pathToFileURL(join(root, "src", "routes", file)).href}?zsys_test=1`
    )) as {
      readonly default?: unknown;
    };
    if (isRoute(module.default)) routes.push(module.default);
  }
  if (routes.length === 0) throw new Error("No test routes were found in src/routes.");
  return routes;
}

async function handleRequest(
  routes: readonly Route[],
  runtime: TestRuntime,
  request: Request,
): Promise<Response> {
  const url = new URL(request.url);
  const matched = routes.find((route) => route.method === request.method && match(route.path, url));
  if (matched === undefined) return new Response("Not found", { status: 404 });
  const params = match(matched.path, url) ?? {};
  const body = await readBody(request);
  try {
    const value = await runtime.invoke(
      matched.target,
      mapInput(matched.request, url, params, request, body),
    );
    const status = matched.responses.find((response) => response.kind === "success")?.status ?? 200;
    return new Response(value === undefined ? null : JSON.stringify(value), {
      status,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      },
    );
  }
}

function mapInput(
  mapping: unknown,
  url: URL,
  params: Readonly<Record<string, string>>,
  request: Request,
  body: unknown,
): unknown {
  if (!isRecord(mapping)) return {};
  if (mapping.kind === "input" || mapping.kind === "nested") {
    const fields = isRecord(mapping.fields) ? mapping.fields : {};
    return Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [
        key,
        mapInput(value, url, params, request, body),
      ]),
    );
  }
  if (mapping.kind === "constant") return mapping.value;
  if (mapping.kind === "default") {
    const value = mapInput(mapping.value, url, params, request, body);
    return value === undefined ? mapping.default : value;
  }
  if (mapping.kind === "optional") return mapInput(mapping.value, url, params, request, body);
  if (mapping.kind === "query") return url.searchParams.get(String(mapping.name)) ?? undefined;
  if (mapping.kind === "path") return params[String(mapping.name)];
  if (mapping.kind === "header") return request.headers.get(String(mapping.name)) ?? undefined;
  if (mapping.kind === "body")
    return mapping.name === undefined ? body : valueAt(body, String(mapping.name));
  throw new TypeError(`Unsupported test HTTP mapping: ${String(mapping.kind)}`);
}

async function readBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text === "") return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function match(path: string, url: URL): Record<string, string> | undefined {
  const expected = path.split("/");
  const actual = url.pathname.split("/");
  if (expected.length !== actual.length) return undefined;
  const params: Record<string, string> = {};
  for (let index = 0; index < expected.length; index += 1) {
    const segment = expected[index]!;
    const value = actual[index]!;
    if (segment.startsWith(":")) params[segment.slice(1)] = decodeURIComponent(value);
    else if (segment !== value) return undefined;
  }
  return params;
}

function valueAt(value: unknown, name: string): unknown {
  return isRecord(value) ? value[name] : undefined;
}

function isRoute(value: unknown): value is Route {
  return (
    isRecord(value) &&
    typeof value.method === "string" &&
    typeof value.path === "string" &&
    isRecord(value.target) &&
    typeof value.target.handler === "function" &&
    isRecord(value.request) &&
    Array.isArray(value.responses)
  );
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
