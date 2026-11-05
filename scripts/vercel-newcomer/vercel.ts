/**
 * The Vercel operations the newcomer deploy test needs, behind one interface so that the control
 * flow also runs against a stub. Projects and environment variables go through the REST API; the
 * deployment goes through the pinned Vercel CLI, which uploads the project and builds it remotely.
 * The token comes from `VERCEL_TOKEN`, or locally from the CLI's `vercel login` session.
 */
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/** Vercel CLI release the test deploys with; the generated workflow pins the same one. */
export const VERCEL_TEST_CLI = "vercel@65.11.0";

/** Vercel operations used by the test, in the order the flow calls them. */
export interface VercelDriver {
  /** @returns Whether the token is valid. */
  authenticated(): Promise<boolean>;
  /** Creates a project without deployment protection. @param name - Name. @returns Its ID. */
  createProject(name: string): Promise<string>;
  /** Sets an encrypted production variable. */
  setEnv(projectId: string, key: string, value: string): Promise<void>;
  /** Uploads `projectRoot`, builds it remotely and promotes it. @returns The deployment's URL. */
  deploy(projectRoot: string, projectId: string): Promise<string>;
  /** Deletes the project with its deployments, cron jobs and variables. */
  deleteProject(projectId: string): Promise<void>;
}

/**
 * Finds the token: `VERCEL_TOKEN`, or the CLI's stored login.
 * @returns The token, if any.
 */
export async function vercelToken(): Promise<string | undefined> {
  if (process.env.VERCEL_TOKEN) return process.env.VERCEL_TOKEN;
  const directories = [
    join(homedir(), "Library", "Application Support", "com.vercel.cli"),
    join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), "com.vercel.cli"),
  ];
  for (const directory of directories) {
    const auth = await readFile(join(directory, "auth.json"), "utf8").catch(() => undefined);
    if (auth !== undefined) return (JSON.parse(auth) as { token?: string }).token;
  }
  return undefined;
}

/**
 * Creates the live driver.
 * @param token - Vercel access token.
 * @param teamId - Team the throwaway project belongs to; the token's personal account otherwise.
 * @returns The driver.
 */
export function vercelDriver(token: string, teamId: string | undefined): VercelDriver {
  const scope = teamId === undefined ? "" : `teamId=${encodeURIComponent(teamId)}`;
  const api = async (method: string, path: string, body?: unknown) => {
    const separator = path.includes("?") ? "&" : "?";
    const response = await fetch(`https://api.vercel.com${path}${scope ? separator + scope : ""}`, {
      method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`${method} ${path} answered ${response.status}: ${text}`);
    return text === "" ? {} : (JSON.parse(text) as Record<string, unknown>);
  };
  let owner: string | undefined = teamId;
  return {
    authenticated: async () => {
      const user = await api("GET", "/v2/user").catch(() => undefined);
      owner ??= (user?.user as { id?: string } | undefined)?.id;
      return user !== undefined;
    },
    createProject: async (name) => {
      const project = await api("POST", "/v11/projects", { name, framework: null });
      const id = String(project.id);
      // The test reads the deployment's own URL, so the throwaway project needs no protection.
      await api("PATCH", `/v9/projects/${id}`, { ssoProtection: null });
      return id;
    },
    setEnv: async (projectId, key, value) => {
      await api("POST", `/v10/projects/${projectId}/env`, {
        key,
        value,
        type: "encrypted",
        target: ["production"],
      });
    },
    deploy: async (projectRoot, projectId) => {
      const child = Bun.spawn(
        ["bunx", VERCEL_TEST_CLI, "deploy", "--prod", "--yes", "--token", token],
        {
          cwd: projectRoot,
          env: { ...process.env, VERCEL_ORG_ID: owner ?? "", VERCEL_PROJECT_ID: projectId },
          stdin: "ignore",
          stdout: "pipe",
          stderr: "inherit",
        },
      );
      const [code, output] = await Promise.all([child.exited, new Response(child.stdout).text()]);
      if (code !== 0) throw new Error(`vercel deploy failed (exit ${code})`);
      const url = output
        .trim()
        .split(/\s+/u)
        .findLast((word) => word.startsWith("https://"));
      if (url === undefined) throw new Error(`vercel deploy printed no URL: ${output}`);
      return url;
    },
    deleteProject: async (projectId) => {
      await api("DELETE", `/v9/projects/${projectId}`);
    },
  };
}
