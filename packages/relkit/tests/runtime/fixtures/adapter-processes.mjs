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

// A child started with `processGroup` leads a group: a signal to the negative pid reaches its
// own children too, and a child started without the option does not lead one.
const grouped = runtime.processes.spawn(["sh", "-c", "sleep 30 & echo $!; wait"], {
  processGroup: true,
});
const reader = grouped.stdout.getReader();
const grandchild = Number.parseInt(new TextDecoder().decode((await reader.read()).value), 10);
const leads = (pid) => {
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
};
const plain = runtime.processes.spawn(["sleep", "30"], { stdout: "ignore", stderr: "ignore" });
const plainLeads = leads(plain.pid);
plain.kill("SIGTERM");
await plain.exited;
const groupLeads = leads(grouped.pid);
process.kill(-grouped.pid, "SIGTERM");
await grouped.exited;
let grandchildGone = false;
for (let waited = 0; waited < 2_000 && !grandchildGone; waited += 25) {
  try {
    process.kill(grandchild, 0);
    await new Promise((resolve) => setTimeout(resolve, 25));
  } catch {
    grandchildGone = true;
  }
}

process.stdout.write(
  JSON.stringify({
    name: runtime.name,
    piped: { stdout, stderr, exitCode },
    reply,
    killed: { exited: killed, signalCode: sleeper.signalCode },
    missing,
    group: { plainLeads, groupLeads, grandchildGone },
    which: runtime.processes.which("sh") !== null,
    whichMissing: runtime.processes.which("relkit-no-such-executable"),
    resolved: runtime.modules.resolve("hono", here).endsWith(".js"),
    registry: runtime.modules.registry !== undefined,
  }),
);
