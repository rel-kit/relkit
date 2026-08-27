import { afterEach, expect, test } from "bun:test";
import { INSPECTOR_BACKEND_PROXY, inspectorBackendUrl } from "./client";

const previousBackendUrl = process.env.NEXT_PUBLIC_RELKIT_BACKEND_URL;

afterEach(() => {
  if (previousBackendUrl === undefined) delete process.env.NEXT_PUBLIC_RELKIT_BACKEND_URL;
  else process.env.NEXT_PUBLIC_RELKIT_BACKEND_URL = previousBackendUrl;
});

test("uses the same-origin proxy when a runtime public URL is unavailable", () => {
  delete process.env.NEXT_PUBLIC_RELKIT_BACKEND_URL;
  expect(inspectorBackendUrl()).toBe(INSPECTOR_BACKEND_PROXY);
});

test("preserves an explicitly configured backend URL", () => {
  process.env.NEXT_PUBLIC_RELKIT_BACKEND_URL = "http://127.0.0.1:3212";
  expect(inspectorBackendUrl()).toBe("http://127.0.0.1:3212");
});

test("uses the same-origin proxy for a local hostname alias", () => {
  process.env.NEXT_PUBLIC_RELKIT_BACKEND_URL = "http://127.0.0.1:3210/_relkit/backend";
  const previousWindow = (globalThis as { window?: unknown }).window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location: { href: "http://localhost:3210/routes" } },
  });
  try {
    expect(inspectorBackendUrl()).toBe(INSPECTOR_BACKEND_PROXY);
  } finally {
    if (previousWindow === undefined) Reflect.deleteProperty(globalThis, "window");
    else Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
  }
});
