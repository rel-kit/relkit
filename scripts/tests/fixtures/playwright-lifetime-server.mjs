/** Real native Playwright webServer fixture records a same-group descendant and
 * graceful termination, without launching a browser or contacting a registry.
 */
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createServer } from "node:http";
const child = spawn(process.execPath, ["-e", "setInterval(()=>{},100)"], { stdio: "ignore" });
const server = createServer((_request, response) => response.end("ready"));
server.listen(Number(process.env.RELKIT_LIFETIME_PORT), "127.0.0.1", () => {
  writeFileSync("descendants.json", JSON.stringify([process.pid, child.pid]));
});
process.once("SIGTERM", () => {
  writeFileSync("graceful.txt", "SIGTERM");
  child.once("exit", () => server.close());
});
