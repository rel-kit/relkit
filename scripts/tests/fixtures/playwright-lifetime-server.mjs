/** Real native Playwright webServer fixture records a same-group descendant and
 * graceful termination, without launching a browser or contacting a registry.
 */
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";

const artifacts = process.env.RELKIT_E2E_ARTIFACTS;
if (!artifacts) throw new Error("Missing owned fixture directory");
const child = spawn(process.execPath, ["-e", "setInterval(()=>{},100)"], { stdio: "ignore" });
const server = createServer((_request, response) => response.end("ready"));
server.listen(Number(process.env.RELKIT_LIFETIME_PORT), "127.0.0.1", () => {
  writeFileSync(join(artifacts, "descendants.json"), JSON.stringify([process.pid, child.pid]));
});
process.once("SIGTERM", () => {
  writeFileSync(join(artifacts, "graceful.txt"), "SIGTERM");
  child.once("exit", () => server.close());
});
