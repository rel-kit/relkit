import { expect, test } from "bun:test";
import { identityHeaders, streamFetcher } from "./src/react/context-support.ts";

test("client headers include the Relkit CSRF cookie", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { cookie: "other=value; relkit_csrf=csrf-token" },
  });
  try {
    const headers = await identityHeaders(undefined, undefined);
    expect(headers.get("x-relkit-csrf")).toBe("csrf-token");
  } finally {
    if (descriptor === undefined) Reflect.deleteProperty(globalThis, "document");
    else Object.defineProperty(globalThis, "document", descriptor);
  }
});

test("stream timeout applies only until response establishment", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    await Bun.sleep(5);
    return new Response(
      new ReadableStream({
        async start(controller) {
          await Bun.sleep(30);
          controller.enqueue(new TextEncoder().encode("still-open"));
          controller.close();
        },
      }),
    );
  }) as typeof fetch;
  try {
    const response = await streamFetcher(10)("http://relkit.test/rpc");
    expect(await response.text()).toBe("still-open");
  } finally {
    globalThis.fetch = original;
  }
});

test("stream establishment still has a bounded timeout", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = ((_: unknown, init?: RequestInit) =>
    new Promise((_, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    })) as typeof fetch;
  try {
    await expect(streamFetcher(5)("http://relkit.test/rpc")).rejects.toHaveProperty(
      "name",
      "TimeoutError",
    );
  } finally {
    globalThis.fetch = original;
  }
});
