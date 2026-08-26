import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { symlink, unlink } from "node:fs/promises";

export function dockerfile(): string {
  return `FROM oven/bun:1.3.10
ARG SOURCE_DATE_EPOCH=0
WORKDIR /app
COPY server/index.js ./server/index.js
COPY application.graph.json manifest.json openapi.json ./
COPY public/ ./public/
RUN mkdir -p .zsys/state .zsys/observability && chown -R bun:bun .zsys
USER bun
ENV NODE_ENV=production
EXPOSE 3000
STOPSIGNAL SIGTERM
CMD ["bun", "run", "--no-env-file", "server/index.js"]
`;
}

export function dockerignore(): string {
  return `*
!Dockerfile
!.dockerignore
!manifest.json
!application.graph.json
!openapi.json
!public/
!public/**
!server/
!server/index.js
.env
.env.*
.zsys/state
.zsys/observability
`;
}

export async function bundleServer(serverDirectory: string, projectRoot: string): Promise<void> {
  const runtimeModules = resolve(dirname(fileURLToPath(import.meta.url)), "../../node_modules");
  const moduleLink = join(serverDirectory, "node_modules");
  await symlink(runtimeModules, moduleLink, "dir");
  try {
    const child = Bun.spawn(
      [
        process.execPath,
        "build",
        "--target=bun",
        "--format=esm",
        "--minify",
        "--sourcemap=none",
        "--env=disable",
        `--outfile=${join(serverDirectory, "index.js")}`,
        join(serverDirectory, "index.ts"),
      ],
      { cwd: projectRoot, stdout: "pipe", stderr: "pipe" },
    );
    const [exitCode, output, error] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    if (exitCode !== 0) {
      throw new Error(error.trim() || output.trim() || "Unable to bundle the production server.");
    }
  } finally {
    await unlink(moduleLink);
  }
}

export function rebaseManifest(
  source: string,
  projectRoot: string,
  sourceDirectory: string,
  targetDirectory: string,
): string {
  const sourcePrefix = manifestImportPrefix(sourceDirectory, projectRoot);
  const targetPrefix = manifestImportPrefix(targetDirectory, projectRoot);
  return source.replaceAll(`from "${sourcePrefix}`, `from "${targetPrefix}`);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function manifestImportPrefix(directory: string, projectRoot: string): string {
  const rootPath = relative(directory, projectRoot).replaceAll("\\", "/");
  return rootPath === "" ? "./" : `${rootPath}/`;
}
