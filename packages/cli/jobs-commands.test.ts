import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { jobsBaseUrl } from "./src/commands/jobs-request.js";
import { runJobs } from "./src/commands/jobs.js";

const roots: string[] = [];
const originalFetch = globalThis.fetch;

afterEach(async () => {
  globalThis.fetch = originalFetch;
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("jobs CLI", () => {
  test("pins jobs requests to the local loopback server", () => {
    const url = new URL(jobsBaseUrl());
    expect(url.protocol).toBe("http:");
    expect(url.hostname).toBe("127.0.0.1");
  });

  test("rejects an unsafe local server port before building a request URL", () => {
    expect(() => jobsBaseUrl("3000@attacker.example")).toThrow(
      "PORT must be a valid local server port.",
    );
  });

  test("resolves a durable job ID and submits through the jobs RPC", async () => {
    const root = await project({ "input.json": JSON.stringify({ orderId: "order-1" }) });
    const requests: Request[] = [];
    globalThis.fetch = async (input, init) => {
      const request = new Request(input, init);
      if (isIdentityRequest(request)) return identityResponse();
      requests.push(request);
      if (new URL(request.url).pathname.endsWith("/jobs/definitions"))
        return json({ items: [{ id: "orders.export", name: "exportOrders" }] });
      return json({ json: { accepted: true, runId: "run-1" } });
    };
    const captured = output();

    expect(
      await runJobs(
        [
          "trigger",
          "--project-root",
          root,
          "--job",
          "orders.export",
          "--input-file",
          "input.json",
          "--operation-id",
          "operation-1",
          "--idempotency-key",
          "key-1",
          "--delay",
          "1 second",
        ],
        captured.context,
      ),
    ).toBe(0);

    const request = requests.find((value) => value.url.includes("/rpc/jobs/exportOrders/trigger"));
    expect(request).toBeDefined();
    expect(await request!.json()).toEqual({
      json: {
        input: { orderId: "order-1" },
        options: { operationId: "operation-1", idempotencyKey: "key-1", delay: "1 second" },
      },
    });
    expect(captured.outputs[0]).toEqual({ accepted: true, runId: "run-1" });
  });

  test("reports an unknown trigger outcome with its recovery identifiers", async () => {
    const root = await project({ "input.json": JSON.stringify({ orderId: "order-1" }) });
    globalThis.fetch = async (input) => {
      const path = new URL(input).pathname;
      if (path.endsWith("/client/identity")) return identityResponse();
      if (path.endsWith("/jobs/definitions"))
        return json({ items: [{ id: "orders.export", name: "exportOrders" }] });
      return new Response(
        JSON.stringify({
          json: {
            defined: true,
            inferable: true,
            code: "RELKIT_JOB_SUBMISSION_UNKNOWN",
            message: "The provider did not confirm acceptance.",
            data: {
              outcome: "unknown",
              operationId: "operation-1",
              idempotencyKey: "key-1",
              recovery: { action: "retry-with-same-key" },
            },
          },
        }),
        { status: 503, headers: { "content-type": "application/json" } },
      );
    };
    const captured = output();

    expect(
      await runJobs(
        [
          "trigger",
          "--project-root",
          root,
          "--job",
          "orders.export",
          "--input-file",
          "input.json",
          "--operation-id",
          "operation-1",
          "--idempotency-key",
          "key-1",
        ],
        captured.context,
      ),
    ).toBe(1);
    expect(captured.errors[0]).toEqual({
      code: "RELKIT_JOB_SUBMISSION_UNKNOWN",
      message: expect.stringContaining("operationId=operation-1"),
    });
    expect(captured.errors[0]).toEqual({
      code: "RELKIT_JOB_SUBMISSION_UNKNOWN",
      message: expect.stringContaining("idempotencyKey=key-1"),
    });
  });

  test("sends schedule definitions as JSON and queries runtime capabilities", async () => {
    const root = await project({
      "schedule.json": JSON.stringify({ id: "daily", cron: "0 0 * * *" }),
    });
    const requests: Request[] = [];
    globalThis.fetch = async (input, init) => {
      const request = new Request(input, init);
      if (isIdentityRequest(request)) return identityResponse();
      requests.push(request);
      return json({ items: [{ service: "local", health: { state: "ready" } }] });
    };
    const scheduleOutput = output();

    expect(
      await runJobs(
        [
          "schedules",
          "upsert",
          "--project-root",
          root,
          "--service",
          "local",
          "--definition-file",
          "schedule.json",
          "--operation-id",
          "schedule-1",
        ],
        scheduleOutput.context,
      ),
    ).toBe(0);
    const scheduleRequest = requests[0]!;
    expect(new URL(scheduleRequest.url).searchParams.get("service")).toBe("local");
    expect(scheduleRequest.headers.get("x-relkit-operation-id")).toBe("schedule-1");
    expect(await scheduleRequest.json()).toEqual({
      definition: { id: "daily", cron: "0 0 * * *" },
    });

    const capabilityOutput = output();
    expect(await runJobs(["capabilities", "--service", "local"], capabilityOutput.context)).toBe(0);
    const capabilityRequest = requests[1]!;
    expect(new URL(capabilityRequest.url).pathname).toContain("/jobs/services/local");
    expect(capabilityOutput.outputs[0]).toMatchObject({ items: [{ service: "local" }] });
  });

  test("streams projected watch frames and forwards the resume cursor", async () => {
    const root = await project();
    const requests: Request[] = [];
    globalThis.fetch = async (input, init) => {
      const request = new Request(input, init);
      if (isIdentityRequest(request)) return identityResponse();
      requests.push(request);
      const path = new URL(request.url).pathname;
      if (path.endsWith("/jobs/runs/run-1")) return json({ run: { jobId: "orders.export" } });
      if (path.endsWith("/jobs/definitions"))
        return json({ items: [{ id: "orders.export", name: "exportOrders" }] });
      return eventStream({ kind: "snapshot", run: { runId: "run-1", status: "completed" } });
    };
    const captured = output();

    const code = await runJobs(
      ["runs", "watch", "--project-root", root, "--run-id", "run-1", "--after", "cursor-1"],
      captured.context,
    );
    expect(code).toBe(0);

    const watchRequest = requests.find((value) =>
      value.url.includes("/rpc/jobs/exportOrders/runs/watch"),
    );
    expect(watchRequest).toBeDefined();
    expect(await watchRequest!.json()).toEqual({ json: { runId: "run-1", after: "cursor-1" } });
    expect(captured.outputs).toEqual([
      { kind: "snapshot", run: { runId: "run-1", status: "completed" } },
    ]);
  });
});

async function project(files: Readonly<Record<string, string>> = {}): Promise<string> {
  const root = await mkdtemp(join(process.cwd(), ".relkit-jobs-test-"));
  roots.push(root);
  await Promise.all(
    Object.entries(files).map(([name, value]) => writeFile(join(root, name), value, "utf8")),
  );
  return root;
}

function output() {
  const outputs: unknown[] = [];
  const errors: unknown[] = [];
  return {
    outputs,
    errors,
    context: {
      json: true,
      signal: new AbortController().signal,
      reporter: {
        output: (value: unknown) => outputs.push(value),
        error: (code: string, message: string) => errors.push({ code, message }),
      },
    },
  };
}

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function isIdentityRequest(request: Request): boolean {
  return new URL(request.url).pathname.endsWith("/client/identity");
}

function identityResponse(): Response {
  return json({
    identityScope: "scope-1",
    sessionEpoch: "epoch-1",
    publicFingerprint: "sha256:contract-1",
  });
}

function eventStream(frame: unknown): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(":\n\n"));
      controller.enqueue(
        encoder.encode(`event: message\ndata: ${JSON.stringify({ json: frame })}\n\n`),
      );
      controller.enqueue(encoder.encode("event: close\n\n"));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}
