/**
 * Atomically publishes session-specific discovery using an exclusive temporary
 * inode and a no-overwrite link. Cleanup verifies identity and inode evidence;
 * a colliding or replaced foreign session is never removed or overwritten.
 */
import { link, open, unlink, readdir } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { Effect, Schema } from "effect";
import {
  connectionAttempt,
  InspectionConnectionError,
  rejectConnection,
} from "./connection-error.js";
import { InspectionDescriptorSchema } from "./protocol.schemas.js";
import {
  inspectionDirectory,
  inspectionLstat,
  inspectionProjectId,
  isMissingInspectionPath,
  readInspectionFile,
} from "./files-native.js";
import type { InspectionDescriptor } from "./protocol.types.js";

/**
 * Publishes complete private bytes atomically without replacing any session.
 * @param root - Canonicalizable application root.
 * @param input - Session metadata created after the actual listener binds.
 * @returns Owned descriptor path; acquisition collisions fail without mutation.
 */
export const publishInspectionFile = Effect.fn("Inspection.publishDescriptor")(
  (root: string, input: InspectionDescriptor) =>
    Effect.scoped(
      Effect.gen(function* () {
        const descriptor = yield* Schema.decodeUnknownEffect(InspectionDescriptorSchema, {
          onExcessProperty: "error",
        })(input).pipe(
          Effect.mapError(
            (cause) => new InspectionConnectionError({ operation: "descriptor.invalid", cause }),
          ),
        );
        if (descriptor.projectId !== (yield* inspectionProjectId(root)))
          return yield* rejectConnection("descriptor.project");
        const directory = yield* inspectionDirectory(root, "publish");
        if (directory === undefined) return yield* rejectConnection("directory.missing");
        const path = join(directory, `${descriptor.sessionId}.json`);
        const temporary = join(directory, `.${descriptor.sessionId}.${randomUUID()}.tmp`);
        const file = yield* Effect.acquireRelease(
          connectionAttempt("descriptor.create", () => open(temporary, "wx", 0o600)),
          (handle) =>
            connectionAttempt("descriptor.close", () => handle.close()).pipe(
              Effect.andThen(removeTemporary(temporary)),
              Effect.catchTag("InspectionConnectionError", () =>
                Effect.logWarning("Inspection publication cleanup failed"),
              ),
            ),
        );
        yield* connectionAttempt("descriptor.write", () =>
          file.writeFile(JSON.stringify(descriptor), "utf8"),
        );
        yield* connectionAttempt("descriptor.sync", () => file.sync());
        // link atomically exposes the finished inode and fails EEXIST instead of overwriting.
        yield* connectionAttempt("descriptor.publish", () => link(temporary, path));
        yield* Effect.logInfo("Inspection session descriptor published", {
          sessionId: descriptor.sessionId,
        });
        return path;
      }),
    ),
);

/**
 * Removes only matching session authority, never an old generation's foreign file.
 * @param path - Exact path returned by publication.
 * @param owner - Session identity and credential retained by the publishing owner.
 * @returns Whether this session's own current inode was removed.
 */
export const removeOwnedInspectionFile = Effect.fn("Inspection.removeDescriptor")(function* (
  path: string,
  owner: InspectionDescriptor,
) {
  const directory = dirname(resolve(path));
  const state = dirname(directory);
  if (basename(directory) !== "connections" || basename(state) !== ".relkit") return false;
  const root = dirname(state);
  if (
    (yield* inspectionDirectory(root, "read")) !== directory ||
    (yield* inspectionProjectId(root)) !== owner.projectId
  )
    return false;
  const current = yield* readInspectionFile(path).pipe(
    Effect.catchIf(isMissingInspectionPath, () => Effect.succeed(undefined)),
  );
  if (
    current === undefined ||
    current.descriptor.projectId !== owner.projectId ||
    current.descriptor.sessionId !== owner.sessionId ||
    current.descriptor.token !== owner.token
  )
    return false;
  const latest = yield* inspectionLstat(path);
  if (
    latest?.isSymbolicLink() ||
    latest?.ino !== current.metadata.ino ||
    latest.dev !== current.metadata.dev
  )
    return false;
  yield* connectionAttempt("descriptor.remove", () => unlink(path));
  return true;
});

/**
 * Lists validated metadata without probing PIDs or importing project modules.
 * @param root - Operator-selected project root.
 * @returns Bounded session candidates; incompatible/unsafe files remain untouched.
 */
export const listInspectionFiles = Effect.fn("Inspection.listDescriptors")(function* (
  root: string,
) {
  const directory = yield* inspectionDirectory(root, "read");
  if (directory === undefined) return { files: [], rejected: 0 };
  const names = yield* connectionAttempt("directory.list", () => readdir(directory));
  const candidates = names.filter((name) => /^[a-f0-9-]{36}\.json$/.test(name));
  if (candidates.length > 256) return yield* rejectConnection("discovery.too-many-sessions");
  const inspected = yield* Effect.forEach(
    candidates.sort(),
    (name) =>
      readInspectionFile(join(directory, name)).pipe(
        Effect.map(({ path, descriptor }) => ({ path, descriptor })),
        Effect.catchTag("InspectionConnectionError", () => Effect.succeed(undefined)),
      ),
    { concurrency: 4 },
  );
  const files = inspected.filter((value) => value !== undefined);
  return { files, rejected: inspected.length - files.length };
});

/**
 * Removes a unique temporary inode after publication or acquisition failure.
 * @param path - Exclusive private temporary path owned by this invocation.
 * @returns Cleanup completion; an already absent temporary file is harmless.
 */
function removeTemporary(path: string) {
  return connectionAttempt("descriptor.temporary.remove", () => unlink(path)).pipe(
    Effect.catchIf(isMissingInspectionPath, () => Effect.void),
  );
}
