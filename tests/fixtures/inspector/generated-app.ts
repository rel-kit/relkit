/** Owns a real generated backend, memory-only CLI capture and separate tool child. */
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { generateProject, CREATE_OPTION_DEFAULTS } from "create-relkit";
import { Effect, Exit, Scope } from "effect";
import {
  CliDevCapture,
  devCaptureLayer,
} from "../../../packages/cli/src/commands/dev-capture.service.js";
import { startDev } from "../../../packages/cli/src/commands/dev.js";
import { createDevLocalCompiler } from "../../../packages/cli/src/commands/dev-local.js";

/** Links only the prebuilt workspace fixture; packed acceptance independently verifies external installs. */
async function generatedProject(root: string, inspected: boolean) {
  const projectRoot = join(root, "example");
  const repository = resolve(import.meta.dirname, "../../..");
  await generateProject(
    {
      ...CREATE_OPTION_DEFAULTS,
      name: "example",
      directory: projectRoot,
      install: false,
      git: false,
      json: false,
    },
    {
      templateRoot: join(repository, "templates/default/v1"),
      commandRunner: async () => ({ exitCode: 0 }),
    },
  );
  await mkdir(join(projectRoot, "node_modules/@relkit"), { recursive: true });
  await symlink(
    join(repository, "node_modules/@types"),
    join(projectRoot, "node_modules/@types"),
    "dir",
  );
  for (const name of await readdir(join(repository, "packages"))) {
    if (name !== "create-relkit")
      await symlink(
        join(repository, "packages", name),
        join(projectRoot, "node_modules/@relkit", name),
        "dir",
      );
  }
  const path = join(projectRoot, "relkit.config.ts");
  const config = await readFile(path, "utf8");
  if (!config.includes("defineApp({"))
    throw new Error("Generated fixture must use the public config owner");
  if (inspected)
    await writeFile(
      path,
      config.replace("defineApp({", "defineApp({ inspector: { enabled: true },"),
    );
  return projectRoot;
}

/** Session cleanup precedes capture/fixture release even when native compilation fails. */
export async function generatedAppFixture(inspected = true) {
  const root = await mkdtemp(join(tmpdir(), "relkit-tool-generated-"));
  const scope = Effect.runSync(Scope.make());
  let compiler: ReturnType<typeof createDevLocalCompiler> | undefined;
  let session: Awaited<ReturnType<typeof startDev>> | undefined;
  const close = async () => {
    try {
      try {
        await session?.stop();
      } finally {
        await compiler?.close();
      }
    } finally {
      try {
        await Effect.runPromise(Scope.close(scope, Exit.void));
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  };
  try {
    const projectRoot = await generatedProject(root, inspected);
    compiler = createDevLocalCompiler(projectRoot, false);
    const capture = await Effect.runPromise(
      CliDevCapture.use((service) => service.acquire(inspected, {})).pipe(
        Scope.provide(scope),
        Effect.provide(devCaptureLayer),
      ),
    );
    session = await startDev({
      projectRoot,
      compile: compiler.compile,
      ...(inspected ? { inspector: { host: "127.0.0.1", port: 0 } } : {}),
      stablePort: 0,
      installSignalHandlers: false,
      logger: { human: false, json: false },
      environment: { RELKIT_DEV_LOGS: "1", ...capture.environment },
      inspectionRecords: capture.records,
      onRecord: capture.append,
      observability: { append: capture.append },
    });
    return { root, projectRoot, session, capture, close };
  } catch (cause) {
    await close();
    throw cause;
  }
}

/** Owns one actual built tool and joins its complete process tree on stop. */
export async function launchGeneratedTool(projectRoot: string) {
  const listener = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
  const port = listener.port!;
  await listener.stop(true);
  const child = Bun.spawn(
    [
      process.execPath,
      resolve(import.meta.dirname, "../../../packages/inspector/dist/bin.js"),
      "--project-root",
      projectRoot,
      "--port",
      String(port),
    ],
    { stdout: "inherit", stderr: "inherit" },
  );
  const close = async () => {
    if (child.exitCode !== null) return;
    child.kill("SIGTERM");
    const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
    try {
      await child.exited;
    } finally {
      clearTimeout(timer);
    }
  };
  return { port, close, child };
}

/** Native polling is finite, consumes each response and fails early when the tool exits. */
export async function toolReply(
  tool: Awaited<ReturnType<typeof launchGeneratedTool>>,
  path: string,
  text: string,
) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline && tool.child.exitCode === null) {
    const result = await fetch(`http://127.0.0.1:${tool.port}/_relkit/backend${path}`).then(
      (response) => response.text(),
      () => "",
    );
    if (result.includes(text)) return result;
    await Bun.sleep(100);
  }
  throw new Error(`Tool did not serve ${path} containing ${text}`);
}
