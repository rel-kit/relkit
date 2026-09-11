import { afterAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createTestAgentStateProvider,
  createTestApplication,
  createTestRealtimeProvider,
} from "@relkit/testing";
import config from "../../relkit.config.js";

const providerRoot = await mkdtemp(join(tmpdir(), "relkit-agent-template-"));
const testApp = await createTestApplication(config, {
  providers: {
    "agent-state": { default: createTestAgentStateProvider(join(providerRoot, "agents")) },
    realtime: { default: createTestRealtimeProvider(join(providerRoot, "realtime")) },
  },
});

test("GET /hello", async () => {
  const response = await testApp.http.request("/hello?name=Mustafa");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ message: "Hello, Mustafa!" });
});

afterAll(async () => {
  await testApp.close();
  await rm(providerRoot, { force: true, recursive: true });
});
