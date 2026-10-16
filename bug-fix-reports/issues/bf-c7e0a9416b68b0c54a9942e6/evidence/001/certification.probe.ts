import assert from "node:assert/strict";
import { resolve } from "node:path";
import { certifyCreation } from "../../scripts/certify-create.ts";
import { templateDigest } from "../../scripts/release-create-evidence.ts";
import { CREATE_CAPABILITY_TABLE, currentCreateCapabilityIdentity } from "../../packages/create-relkit/src/create-capabilities.ts";

const root = resolve(import.meta.dir, "../..");
assert.equal(Bun.version, "1.3.10");
assert.equal(process.env.RELKIT_INSPECTOR_ROOT, undefined);
assert.equal(CREATE_CAPABILITY_TABLE.entries.length, 1);
const entry = {
  ...CREATE_CAPABILITY_TABLE.entries[0]!,
  identity: currentCreateCapabilityIdentity(),
  templateDigest: await templateDigest(resolve(root, "templates/default/v1/minimal")),
};
await certifyCreation(root, entry, async (input) => {
  const args = [...input];
  if (args[0] === "x" && args[1] === "turbo") args.push("--concurrency=1");
  if (args.includes("vitest")) args.push("--maxWorkers=1");
  console.log("CERTIFY", JSON.stringify(args));
  const child = Bun.spawn([process.execPath, ...args], { cwd: root, env: process.env, stdout: "inherit", stderr: "inherit" });
  assert.equal(await child.exited, 0, `certification command must succeed: ${args.join(" ")}`);
});
console.log("PASS supported current-template certification: 20 fresh and 20 restart measurements, unchanged threshold and validation");
