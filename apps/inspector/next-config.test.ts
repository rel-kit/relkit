import { afterEach, expect, test } from "bun:test";
import nextConfig from "./next.config";

const previousBackendUrl = process.env.ZSYS_BACKEND_URL;

test("proxies browser backend requests through the inspector origin", async () => {
  process.env.ZSYS_BACKEND_URL = "http://127.0.0.1:3000/";
  expect(await nextConfig.rewrites?.()).toEqual([
    {
      source: "/_zsys/backend/:path*",
      destination: "http://127.0.0.1:3000/:path*",
    },
  ]);
});

afterEach(() => {
  if (previousBackendUrl === undefined) delete process.env.ZSYS_BACKEND_URL;
  else process.env.ZSYS_BACKEND_URL = previousBackendUrl;
});
