import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CONTRACT_VERSION } from "@relkit/contracts";
import { runClient } from "./src/commands/client.js";
import type { CliCommandContext } from "./src/main-support.js";
const originalFetch = globalThis.fetch;
let root: string | undefined;
afterEach(async () => {
  globalThis.fetch = originalFetch;
  if (root !== undefined) await rm(root, { recursive: true, force: true });
});
test("client pull rejects invalid agent metadata before creating output", async () => {
  root = await mkdtemp(join(tmpdir(), "relkit-client-pull-"));
  const out = join(root, "generated");
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        protocol: "relkit.client-contract",
        version: CONTRACT_VERSION,
        graphHash: `sha256:${"a".repeat(64)}`,
        publicFingerprint: `sha256:${"b".repeat(64)}`,
        procedures: [],
        agents: [{ id: "assistant", clientContract: { tools: { broken: true } } }],
      }),
    );
  const context = {
    signal: new AbortController().signal,
    reporter: { output() {}, error() {} },
  } as unknown as CliCommandContext;
  await expect(
    runClient(["pull", "https://example.test", "--out", out], context),
  ).rejects.toMatchObject({
    code: "RELKIT_CLIENT_CONTRACT_INVALID",
    message: expect.stringContaining("clientContract.tools"),
  });
  await expect(stat(out)).rejects.toMatchObject({ code: "ENOENT" });
});

test("client pull writes a validated contract and registry", async () => {
  root = await mkdtemp(join(tmpdir(), "relkit-client-pull-"));
  const out = join(root, "generated");
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        protocol: "relkit.client-contract",
        version: CONTRACT_VERSION,
        graphHash: `sha256:${"a".repeat(64)}`,
        publicFingerprint: `sha256:${"b".repeat(64)}`,
        procedures: [],
        agents: [{ id: "assistant", input: {}, output: {} }],
      }),
    );
  const context = {
    signal: new AbortController().signal,
    reporter: { output() {}, error() {} },
  } as unknown as CliCommandContext;
  expect(await runClient(["pull", "https://example.test", "--out", out], context)).toBe(0);
  expect(await readFile(join(out, "client-registry.d.ts"), "utf8")).toContain(
    'readonly "assistant"',
  );
  expect(await readFile(join(out, "contract.ts"), "utf8")).toContain("export const contract");
});
