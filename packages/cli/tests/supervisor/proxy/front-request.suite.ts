/**
 * The 27.1 front cases, declared once for `bun:test` and for vitest: the two runners share this
 * API shape, and each suite passes its own functions.
 */
import {
  BODIED_READS,
  headerOf,
  leaveAfterHead,
  MALFORMED_HOSTS,
  plainRequest,
  rawExchange,
  startFront,
  type SeenRequest,
} from "./front-request.fixture.ts";

/** The runner functions a suite passes in. */
export interface SuiteRunner {
  readonly test: (name: string, run: () => Promise<void>, timeout?: number) => void;
  readonly beforeAll: (run: () => Promise<void>) => void;
  readonly afterAll: (run: () => Promise<void>) => void;
  // Both runners' `expect` accept any value and return a matcher object.
  readonly expect: (value: unknown, message?: string) => Matchers;
}

/** The matchers the cases use. */
interface Matchers {
  readonly toBe: (expected: unknown) => void;
  readonly toEqual: (expected: unknown) => void;
  readonly toMatchObject: (expected: Record<string, unknown>) => void;
  readonly toBeLessThan: (expected: number) => void;
  readonly not: { readonly toMatch: (expected: RegExp) => void };
}

/**
 * Declares the front cases.
 * @param runner - The suite's runner functions.
 * @param pipelining - Whether the runtime's listener answers pipelined requests; Bun 1.3.10's
 * does not (see the Bun suite).
 */
export function declareFrontSuite(runner: SuiteRunner, pipelining: boolean): void {
  const { test, beforeAll, afterAll, expect } = runner;
  let running: Awaited<ReturnType<typeof startFront>>;
  beforeAll(async () => {
    running = await startFront();
  });
  afterAll(async () => {
    await running.stop();
  });
  /** Checks a plain GET on a new connection is served. */
  const plainServed = async () => {
    const answer = await rawExchange(running.port, plainRequest(running.port, "/a1?n=1"));
    expect(answer.statuses, answer.head).toEqual(["200"]);
    expect(JSON.parse(answer.body)).toMatchObject({ path: "/a1?n=1", contentLength: null });
  };

  for (const host of MALFORMED_HOSTS)
    test(`Host ${JSON.stringify(host)} answers a bare 400`, async () => {
      const answer = await rawExchange(
        running.port,
        `GET /a1 HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`,
      );
      expect(answer.statuses, answer.head).toEqual(["400"]);
      expect(answer.body.length).toBeLessThan(200);
      expect(answer.body).not.toMatch(/<|\/Users\/|\/home\/|node_modules|isPrivateInspectionPath/);
    });

  for (const [name, bytes] of [
    ["HTTP/1.0 without Host", "GET /a1 HTTP/1.0\r\n\r\n"],
    ["an empty Host", "GET /a1 HTTP/1.1\r\nHost: \r\nConnection: close\r\n\r\n"],
  ] as const)
    test(`${name} is served with the front's own authority`, async () => {
      const answer = await rawExchange(running.port, bytes);
      expect(answer.statuses, answer.head).toEqual(["200"]);
      expect(JSON.parse(answer.body)).toMatchObject({
        path: "/a1",
        host: `127.0.0.1:${running.port}`,
      });
    });

  for (const target of ["//_relkit/v1/requests", "//a1", "///a1", "//_relkit/v1/health/ready"])
    test(`${target} answers the front's 404 and never reaches the worker`, async () => {
      const answer = await rawExchange(running.port, plainRequest(running.port, target));
      expect(answer.statuses, answer.head).toEqual(["404"]);
      expect(JSON.parse(answer.body)).toMatchObject({ status: 404, code: "not-found" });
    });

  test("a blocked inspection path's Problem names the request ID of its header", async () => {
    const answer = await rawExchange(
      running.port,
      plainRequest(running.port, "/_relkit/v1/requests"),
    );
    expect(answer.statuses).toEqual(["404"]);
    const requestId = headerOf(answer.head, "x-request-id");
    expect(typeof requestId).toBe("string");
    expect(JSON.parse(answer.body)).toMatchObject({ code: "not-found", requestId });
  });

  test("a throw outside the application's error mapping answers a minimal 500", async () => {
    const answer = await rawExchange(running.port, plainRequest(running.port, "/throw"));
    expect(answer.statuses, answer.head).toEqual(["500"]);
    expect(answer.body.length).toBeLessThan(400);
    expect(answer.body).not.toMatch(/<|\/Users\/|\/home\/|file:|thrown at|node_modules/);
  });

  for (const [method, rest] of BODIED_READS)
    test(`a ${method} with ${rest.split(":")[0]} leaves later requests intact`, async () => {
      const first = await rawExchange(
        running.port,
        `${method} /a1 HTTP/1.1\r\nHost: 127.0.0.1:${running.port}\r\nConnection: close\r\n${rest}`,
      );
      expect(first.statuses, first.head).toEqual(["200"]);
      if (method === "GET")
        expect(JSON.parse(first.body)).toMatchObject({ contentLength: null, text: null });
      for (let index = 0; index < 3; index++) await plainServed();
    });

  test("a client that leaves before reading the body prints nothing", async () => {
    const printed: unknown[][] = [];
    const saved = { error: console.error, info: console.info, warn: console.warn };
    const capture = (...values: unknown[]) => void printed.push(values);
    Object.assign(console, { error: capture, info: capture, warn: capture });
    try {
      for (let index = 0; index < 3; index++) await leaveAfterHead(running.port, "/slow");
      await new Promise((resolve) => setTimeout(resolve, 800));
    } finally {
      Object.assign(console, saved);
    }
    expect(printed.map((values) => values.map(String).join(" "))).toEqual([]);
    await plainServed();
  });

  if (pipelining)
    test("requests written back to back on one connection are answered in order", async () => {
      const one = (index: number) =>
        `GET /a1?n=${index} HTTP/1.1\r\nHost: 127.0.0.1:${running.port}\r\n\r\n`;
      const answer = await rawExchange(
        running.port,
        `${one(1)}${one(2)}${plainRequest(running.port, "/a1?n=3")}`,
      );
      expect(answer.statuses, answer.head).toEqual(["200", "200", "200"]);
    });
}
