// Exercises the adapter's processes and modules on the runtime it runs on and prints one JSON
// report. Plain JavaScript importing the built package, so it runs unchanged on Bun and Node.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRuntimeAdapter } from "relkit/runtime";

const runtime = await loadRuntimeAdapter();
const here = dirname(fileURLToPath(import.meta.url));

const piped = runtime.processes.spawn(
  [process.execPath, "-e", "process.stdin.pipe(process.stdout); process.stderr.write('err')"],
  { stdin: "pipe", env: { PATH: process.env.PATH ?? "" } },
);
piped.stdin.write("in-out");
await piped.stdin.end();
const [stdout, stderr, exitCode] = await Promise.all([
  new Response(piped.stdout).text(),
  new Response(piped.stderr).text(),
  piped.exited,
]);

let reply;
const child = runtime.processes.spawn(
  [
    process.execPath,
    "-e",
    "process.on('message', (m) => { process.send({ echo: m }); process.exit(0); })",
  ],
  { stdout: "ignore", stderr: "ignore", ipc: (message) => (reply = message) },
);
child.send({ value: 1 });
await child.exited;

const sleeper = runtime.processes.spawn(["sleep", "30"], { stdout: "ignore", stderr: "ignore" });
sleeper.kill("SIGTERM");
const killed = await sleeper.exited;

let missing = "spawned";
try {
  runtime.processes.spawn(["relkit-no-such-executable"]);
} catch (error) {
  missing = error.code ?? "thrown";
}

process.stdout.write(
  JSON.stringify({
    name: runtime.name,
    piped: { stdout, stderr, exitCode },
    reply,
    killed: { exited: killed, signalCode: sleeper.signalCode },
    missing,
    which: runtime.processes.which("sh") !== null,
    whichMissing: runtime.processes.which("relkit-no-such-executable"),
    resolved: runtime.modules.resolve("hono", here).endsWith(".js"),
    registry: runtime.modules.registry !== undefined,
  }),
);
