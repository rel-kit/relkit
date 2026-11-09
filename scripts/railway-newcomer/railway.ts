/**
 * The Railway operations the newcomer deploy test needs, behind one interface so that the control
 * flow also runs against a stub. The live implementation drives the `railway` CLI, which reads
 * `RAILWAY_API_TOKEN` (an account token) or a logged-in session.
 */

/** Railway operations used by the test, in the order the flow calls them. */
export interface RailwayDriver {
  /** @returns Whether the CLI is authenticated. */
  authenticated(): Promise<boolean>;
  /** Creates a project linked to `cwd`. @param name - Project name. @returns Its ID. */
  createProject(name: string): Promise<string>;
  /** Adds the Railway Postgres database. */
  addPostgres(): Promise<void>;
  /** Adds an empty service. @param name - Service name. @param variables - Service variables. */
  addService(name: string, variables: Readonly<Record<string, string>>): Promise<void>;
  /** Uploads `cwd` and waits for the build and deploy. @param service - Service name. */
  up(service: string): Promise<void>;
  /** Generates a public domain. @param service - Service name. @returns Its host name. */
  domain(service: string): Promise<string>;
  /**
   * Exposes the Railway Postgres service through a TCP proxy for the test's own reads.
   * @returns A connection URL that reaches the database from outside Railway.
   */
  publicDatabaseUrl(): Promise<string>;
  /** Replaces the running deployment with a new container of the same build. */
  redeploy(service: string): Promise<void>;
  /** Sets the replica count in the service's region. @param replicas - Instance count. */
  scale(service: string, replicas: number): Promise<void>;
  /** Counts the running instances of the service's latest deployment. @param service - Name. */
  runningInstances(service: string): Promise<number>;
  /** Deletes the project and everything in it. @param projectId - Project ID. */
  deleteProject(projectId: string): Promise<void>;
}

/**
 * Runs the Railway CLI in the project directory.
 * @param cwd - Project directory linked to the Railway project.
 * @param args - CLI arguments.
 * @returns Standard output.
 */
async function railway(cwd: string, args: readonly string[]): Promise<string> {
  const child = Bun.spawn(["railway", ...args], {
    cwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (code !== 0) {
    // `railway up --ci` reports build failures on standard output, so keep the end of both.
    const detail = [stderr.trim(), stdout.trim().split("\n").slice(-30).join("\n")]
      .filter((part) => part !== "")
      .join("\n");
    throw new Error(`railway ${args.join(" ")} failed (${code}): ${detail}`);
  }
  return stdout;
}

/**
 * Creates the CLI-backed driver.
 * @param cwd - Project directory.
 * @param workspace - Railway workspace ID or name; required outside a terminal.
 * @returns The live driver.
 */
export function railwayCli(cwd: string, workspace?: string): RailwayDriver {
  let region: string | undefined;
  let project: string | undefined;
  return {
    authenticated: () =>
      railway(cwd, ["whoami", "--json"]).then(
        () => true,
        () => false,
      ),
    createProject: async (name) => {
      const output = await railway(cwd, [
        "init",
        "--name",
        name,
        ...(workspace === undefined ? [] : ["--workspace", workspace]),
        "--json",
      ]);
      const parsed = JSON.parse(output) as { id?: string; projectId?: string };
      const id = parsed.id ?? parsed.projectId;
      if (id === undefined) throw new Error(`railway init returned no project ID: ${output}`);
      project = id;
      return id;
    },
    addPostgres: async () => {
      await railway(cwd, ["add", "--database", "postgres", "--json"]);
    },
    addService: async (name, variables) => {
      await railway(cwd, [
        "add",
        "--service",
        name,
        ...Object.entries(variables).flatMap(([key, value]) => ["--variables", `${key}=${value}`]),
        "--json",
      ]);
    },
    up: async (service) => {
      await railway(cwd, ["up", "--ci", "--service", service]);
    },
    domain: async (service) => {
      const output = await railway(cwd, ["domain", "--service", service, "--json"]);
      const host = /([a-z0-9-]+\.up\.railway\.app)/u.exec(output)?.[1];
      if (host === undefined) throw new Error(`railway domain returned no host: ${output}`);
      return host;
    },
    publicDatabaseUrl: async () => {
      const proxy = await railway(cwd, [
        "tcp-proxy",
        "create",
        "--port",
        "5432",
        "--service",
        "Postgres",
        "--json",
      ]);
      const domain = /"domain"\s*:\s*"([^"]+)"/u.exec(proxy)?.[1];
      const port = /"proxyPort"\s*:\s*(\d+)/u.exec(proxy)?.[1];
      if (domain === undefined || port === undefined)
        throw new Error(`railway tcp-proxy create returned no address: ${proxy}`);
      const variables = await railway(cwd, ["variables", "--service", "Postgres", "--json"]);
      const internal = (JSON.parse(variables) as Record<string, string>).DATABASE_URL;
      if (internal === undefined) throw new Error("The Postgres service has no DATABASE_URL.");
      const url = new URL(internal);
      url.hostname = domain;
      url.port = port;
      return url.toString();
    },
    redeploy: async (service) => {
      await railway(cwd, ["redeploy", "--service", service, "--yes"]);
    },
    scale: async (service, replicas) => {
      region ??= (await serviceInstance(cwd, required(project), service)).region;
      await railway(cwd, ["scale", "--service", service, `${region}=${replicas}`]);
    },
    runningInstances: async (service) => {
      const instance = await serviceInstance(cwd, required(project), service);
      return instance.instances.filter((status) => status === "RUNNING").length;
    },
    deleteProject: async (projectId) => {
      await railway(cwd, ["delete", "--project", projectId, "--yes"]);
    },
  };
}

/**
 * Reads one service's region and the instance states of its latest deployment through Railway's
 * GraphQL API.
 * @param cwd - Project directory.
 * @param projectId - Project ID.
 * @param service - Service name.
 * @returns The region ID, such as `us-west2`, and each instance's status.
 */
async function serviceInstance(
  cwd: string,
  projectId: string,
  service: string,
): Promise<{ readonly region: string; readonly instances: readonly string[] }> {
  const output = await railway(cwd, [
    "api",
    `query { project(id: ${JSON.stringify(projectId)}) { environments { edges { node { serviceInstances { edges { node { serviceName region latestDeployment { meta instances { status } } } } } } } } } }`,
  ]);
  type Instance = {
    serviceName: string;
    region: string | null;
    latestDeployment: { meta: unknown; instances: { status: string }[] } | null;
  };
  const parsed = JSON.parse(output) as {
    data?: {
      project?: {
        environments: {
          edges: { node: { serviceInstances: { edges: { node: Instance }[] } } }[];
        };
      };
    };
  };
  const instance = parsed.data?.project?.environments.edges
    .flatMap((environment) => environment.node.serviceInstances.edges)
    .find((edge) => edge.node.serviceName === service)?.node;
  const meta = JSON.stringify(instance?.latestDeployment?.meta ?? {});
  const region =
    instance?.region ?? /"multiRegionConfig"\s*:\s*\{\s*"([a-z0-9-]+)"/u.exec(meta)?.[1];
  if (instance === undefined || region === undefined)
    throw new Error(`Railway reports no region for ${service}: ${output}`);
  return {
    region,
    instances: instance.latestDeployment?.instances.map((entry) => entry.status) ?? [],
  };
}

/**
 * Requires the project the driver created.
 * @param project - Project ID, once created.
 * @returns The ID.
 */
function required(project: string | undefined): string {
  if (project === undefined) throw new Error("No Railway project was created yet.");
  return project;
}
