import assert from "node:assert/strict";
import { Effect } from "effect";
import { SnapshotFiles } from "../../packages/cli/src/dev-snapshot/snapshot-files.service.js";
import { DevSnapshots } from "../../packages/cli/src/dev-snapshot/snapshot.service.js";
import { readSnapshotTools } from "../../packages/cli/src/dev-snapshot/snapshot-tools.js";

const root = "/Users/mustafaelsayed/Workspace/typescripts/relkit-ecommerce-lab";
const output = process.argv[2];
assert(output, "Evidence output is required");
const receipt = await Bun.file(root + "/.relkit/evidence/dev-process-lifetime-20261016/final-preview/preview-session.json").json();
assert.equal(receipt.state, "running");
const validate = () => Effect.runPromise(Effect.scoped(Effect.gen(function* () {
  const files = yield* SnapshotFiles.make;
  const snapshots = yield* DevSnapshots.make.pipe(Effect.provideService(SnapshotFiles, files));
  return yield* snapshots.validate(root, yield* readSnapshotTools(root));
})));
const before = await validate();
const { cookie } = await Bun.file(root + "/.auth-state.json").json();
async function get(path: string, authenticated = false) {
  const response = await fetch("http://127.0.0.1:3400" + path, { signal: AbortSignal.timeout(5000), headers: authenticated ? {cookie} : {} });
  assert.equal(response.status, 200);
  return response.json();
}
const catalog = await get("/products");
assert.equal(catalog.revision, "v1:base");
assert.equal(catalog.products.length, 3);
assert((await get("/api/auth/get-session", true)).user);
assert.equal((await get("/cart", true)).totalCents, 7200);
const { orderId } = await Bun.file(root + "/evidence/persistence.json").json();
assert.equal((await get("/orders/" + orderId, true)).totalCents, 4900);
for (const url of ["http://127.0.0.1:3400", "http://127.0.0.1:3410", "http://127.0.0.1:3400/_relkit/v1/api-reference"])
  assert.equal((await fetch(url, {signal: AbortSignal.timeout(5000)})).status, 200);
const after = await validate();
assert.equal(after.generation, before.generation);
process.kill(receipt.cliPid, 0);
const result = {status:"passed", generation:after.generation, snapshotCurrentBeforeAndAfterLiveRequests:true, sourceDependencyArtifactAndGraphValidation:true, cliPid:receipt.cliPid, ownerPid:receipt.ownerPid, catalogProducts:3, authenticated:true, cartTotalCents:7200, historicalOrderTotalCents:4900, liveLinks:3};
await Bun.write(output, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result));
