import { expect, test } from "bun:test";
import { oc } from "@orpc/contract";
import { createAutoClient, createClient } from "./src/index.ts";
import { createServerClient } from "./src/server.ts";
import { SpanRuntime, runInExecutionContext, startRootSpan } from "@relkit/invocation";
import {
  AGENT_CAPABILITY_HEADER,
  AGENT_CAPABILITY_VALUE,
  createSpanId,
  createTraceId,
} from "@relkit/contracts";

const schema = {
  "~standard": {
    version: 1 as const,
    vendor: "test",
    validate: (value: unknown) => ({ value }),
  },
};
const contract = { ping: oc.input(schema).output(schema) } as const;

test("reads mutable Headers for each future request and includes credentials", async () => {
  const headers = new Headers();
  const seen: {
    authorization: string | null;
    capabilities: string | null;
    credentials: RequestCredentials | undefined;
  }[] = [];
  const client = createClient<typeof contract>({
    baseUrl: "https://api.example.test",
    headers,
    fetch: async (_input, init) => {
      seen.push({
        authorization: new Headers(init?.headers).get("authorization"),
        capabilities: new Headers(init?.headers).get(AGENT_CAPABILITY_HEADER),
        credentials: init?.credentials,
      });
      return Response.json({}, { status: 500 });
    },
  });

  await client.ping({}).catch(() => undefined);
  headers.set("authorization", "Bearer current");
  await client.ping({}).catch(() => undefined);
  headers.delete("authorization");
  await client.ping({}).catch(() => undefined);

  expect(seen).toEqual([
    { authorization: null, capabilities: AGENT_CAPABILITY_VALUE, credentials: "include" },
    {
      authorization: "Bearer current",
      capabilities: AGENT_CAPABILITY_VALUE,
      credentials: "include",
    },
    { authorization: null, capabilities: AGENT_CAPABILITY_VALUE, credentials: "include" },
  ]);
});

test("evaluates async headers for each request and honors credentials overrides", async () => {
  let token: string | undefined;
  const seen: { authorization: string | null; capabilities: string | null }[] = [];
  const client = createClient<typeof contract>({
    baseUrl: "https://api.example.test/root/",
    credentials: "same-origin",
    headers: async () =>
      new Headers(token === undefined ? {} : { authorization: `Bearer ${token}` }),
    fetch: async (_input, init) => {
      expect(init?.credentials).toBe("same-origin");
      const headers = new Headers(init?.headers);
      seen.push({
        authorization: headers.get("authorization"),
        capabilities: headers.get(AGENT_CAPABILITY_HEADER),
      });
      return Response.json({}, { status: 500 });
    },
  });

  token = "one";
  await client.ping({}).catch(() => undefined);
  token = "two";
  await client.ping({}).catch(() => undefined);
  expect(seen).toEqual([
    { authorization: "Bearer one", capabilities: AGENT_CAPABILITY_VALUE },
    { authorization: "Bearer two", capabilities: AGENT_CAPABILITY_VALUE },
  ]);
});

test("server clients create client spans and inject their active W3C context", async () => {
  const lifecycle: string[] = [];
  const runtime = new SpanRuntime({
    ids: { next: (kind) => (kind === "trace" ? createTraceId() : createSpanId()) },
    observer: (event) => lifecycle.push(`${event.type}:${event.span.kind}`),
  });
  const root = startRootSpan(runtime, "request", "server");
  let traceparent: string | null = null;
  let responseBody: ReadableStream<Uint8Array> | null = null;
  const client = createServerClient<typeof contract>({
    baseUrl: "https://api.example.test",
    fetch: async (_input, init) => {
      traceparent = new Headers(init?.headers).get("traceparent");
      const response = Response.json({});
      responseBody = response.body;
      return response;
    },
  });

  await runInExecutionContext({ span: root, runtime }, () => client.ping({}));
  expect(traceparent).toMatch(new RegExp(`^00-${root.traceId}-[0-9a-f]{16}-01$`));
  expect(lifecycle).toContain("completed:client");
  expect(responseBody).not.toBeNull();
  runtime.close();
});

test("auto transport falls back only when WebSocket establishment fails", async () => {
  let fetches = 0;
  class FailedSocket extends EventTarget {
    constructor() {
      super();
      queueMicrotask(() => this.dispatchEvent(new Event("error")));
    }
    close() {}
  }
  const client = createAutoClient<typeof contract>({
    baseUrl: "https://api.example.test",
    websocket: FailedSocket as unknown as typeof WebSocket,
    fetch: async () => {
      fetches += 1;
      return Response.json({}, { status: 500 });
    },
  });
  await client.ping({}).catch(() => undefined);
  expect(fetches).toBe(1);
});
