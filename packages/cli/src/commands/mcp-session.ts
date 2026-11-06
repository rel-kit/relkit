/**
 * Finds the project's running development session from the private descriptors under
 * `.relkit/connections` and authenticates it with the bridge handshake. Discovery reads
 * metadata only: it imports no project code and never removes a stale descriptor.
 */
import { Effect, Schema } from "effect";
import {
  INSPECTION_HANDSHAKE_PATH,
  InspectionFiles,
  InspectionHandshakeSchema,
  type InspectionDescriptor,
} from "relkit/inspector-api/connection";
import { fail } from "../main-support.js";
import type { McpSession } from "./mcp.types.js";

const API_VERSION_HEADER = "x-relkit-api-version";
const HANDSHAKE_TIMEOUT_MS = 2000;

/**
 * Selects exactly one live session for the project.
 * @param root - Absolute application root.
 * @returns The session; fails with `RELKIT_MCP_NO_SESSION` or `RELKIT_MCP_SESSION_AMBIGUOUS`.
 */
export const discoverMcpSession = Effect.fn("Cli.mcp.discover")(function* (root: string) {
  const files = yield* InspectionFiles;
  const project = yield* files.projectId(root).pipe(Effect.mapError(noSession));
  const listing = yield* files.list(root).pipe(Effect.mapError(noSession));
  const live = yield* Effect.forEach(
    listing.files.filter((file) => file.descriptor.projectId === project),
    (file) => Effect.promise(() => handshake(file.descriptor)),
    { concurrency: 4 },
  );
  const sessions = live.filter((value): value is InspectionDescriptor => value !== undefined);
  if (sessions.length === 0) return yield* Effect.fail(noSession());
  if (sessions.length > 1)
    return yield* Effect.fail(
      fail(
        "RELKIT_MCP_SESSION_AMBIGUOUS",
        `Found ${sessions.length} running development sessions for this project. Stop the extra relkit dev processes, then start relkit mcp again.`,
      ),
    );
  return mcpSession(root, sessions[0]!);
});

/**
 * Builds the request function for one authenticated session.
 * @param root - Application root.
 * @param descriptor - Private descriptor that passed the handshake.
 * @returns A session whose mutations carry the generation the bridge currently serves.
 */
export function mcpSession(root: string, descriptor: InspectionDescriptor): McpSession {
  let generation: string | undefined;
  const send = (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${descriptor.token}`);
    headers.set("x-relkit-project-id", descriptor.projectId);
    headers.set("x-relkit-session-id", descriptor.sessionId);
    headers.set("host", new URL(descriptor.endpoint).host);
    if (path.startsWith("/_relkit/v1")) headers.set(API_VERSION_HEADER, "1");
    if (generation !== undefined) headers.set("x-relkit-generation-id", generation);
    return fetch(new URL(path, descriptor.endpoint), { ...init, headers, redirect: "manual" });
  };
  const refresh = async () => {
    const response = await send(INSPECTION_HANDSHAKE_PATH);
    const body = (await response.json().catch(() => ({}))) as { generationId?: unknown };
    generation = typeof body.generationId === "string" ? body.generationId : undefined;
  };
  return {
    root,
    descriptor,
    request: async (path, init = {}) => {
      const method = (init.method ?? "GET").toUpperCase();
      if (method !== "GET" && generation === undefined) await refresh();
      const response = await send(path, init);
      if (response.status !== 409 || method === "GET") return response;
      await response.body?.cancel();
      await refresh();
      return send(path, init);
    },
  };
}

/**
 * Proves a descriptor belongs to a live session of the same project.
 * @param descriptor - Candidate read from `.relkit/connections`.
 * @returns The descriptor when its bridge answers with matching identity.
 */
async function handshake(
  descriptor: InspectionDescriptor,
): Promise<InspectionDescriptor | undefined> {
  try {
    const response = await fetch(new URL(INSPECTION_HANDSHAKE_PATH, descriptor.endpoint), {
      headers: {
        authorization: `Bearer ${descriptor.token}`,
        "x-relkit-project-id": descriptor.projectId,
        "x-relkit-session-id": descriptor.sessionId,
      },
      redirect: "manual",
      signal: AbortSignal.timeout(HANDSHAKE_TIMEOUT_MS),
    });
    if (!response.ok) return undefined;
    const value = Schema.decodeUnknownSync(Schema.fromJsonString(InspectionHandshakeSchema))(
      await response.text(),
    );
    return value.projectId === descriptor.projectId && value.sessionId === descriptor.sessionId
      ? descriptor
      : undefined;
  } catch {
    return undefined;
  }
}

/** The coded failure that tells the agent to start the development session. */
function noSession() {
  return fail(
    "RELKIT_MCP_NO_SESSION",
    "No running relkit dev session with the Inspector bridge was found for this project. Run relkit add inspector if the project does not enable it, start relkit dev, then start relkit mcp again.",
  );
}
