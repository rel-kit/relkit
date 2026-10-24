/** Binds a history directory to one project without replacing existing data or deleting locks. */
import { constants } from "node:fs";
import { link, lstat, mkdir, open, unlink } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Effect, Schema } from "effect";
import {
  connectionAttempt,
  InspectionProjectId,
  InspectionConnectionError,
} from "@relkit/inspector-api/connection";

const binding = Schema.fromJsonString(Schema.Struct({ projectId: InspectionProjectId }));

/** Publishes an immutable project marker atomically, retaining legacy history in place. */
export const bindInspectorHistory = Effect.fn("Inspector.bindHistory")(function* (
  root: string,
  projectId: string,
) {
  yield* connectionAttempt("history.directory", () =>
    mkdir(root, { recursive: true, mode: 0o700 }),
  );
  const metadata = yield* connectionAttempt("history.directory-stat", () => lstat(root));
  if (!metadata.isDirectory() || metadata.isSymbolicLink())
    return yield* conflict("history.directory-unsafe");
  const path = join(root, ".inspection-project.json");
  const temporary = join(root, `.inspection-project.${randomUUID()}.tmp`);
  yield* Effect.scoped(
    Effect.gen(function* () {
      const file = yield* Effect.acquireRelease(
        connectionAttempt("history.marker-create", () => open(temporary, "wx", 0o600)),
        (file) =>
          connectionAttempt("history.marker-close", () => file.close()).pipe(
            Effect.andThen(connectionAttempt("history.temporary-remove", () => unlink(temporary))),
            Effect.catchTag("InspectionConnectionError", () =>
              Effect.logWarning("History marker cleanup failed"),
            ),
          ),
      );
      yield* connectionAttempt("history.marker-write", () =>
        file.writeFile(JSON.stringify({ projectId }), "utf8"),
      );
      yield* connectionAttempt("history.marker-sync", () => file.sync());
      yield* connectionAttempt("history.marker-publish", () => link(temporary, path)).pipe(
        Effect.catchIf(
          (error) => "code" in error.cause && error.cause.code === "EEXIST",
          () => Effect.void,
        ),
      );
    }),
  );
  const value = yield* readBinding(path);
  if (value.projectId !== projectId) return yield* conflict("history.foreign-project");
});

/** Bounds and validates an existing marker without following a replacement symlink. */
const readBinding = Effect.fn("Inspector.readHistoryBinding")((path: string) =>
  Effect.scoped(
    Effect.gen(function* () {
      const file = yield* Effect.acquireRelease(
        connectionAttempt("history.marker-open", () =>
          open(path, constants.O_RDONLY | constants.O_NOFOLLOW),
        ),
        (file) =>
          connectionAttempt("history.marker-close", () => file.close()).pipe(
            Effect.catchTag("InspectionConnectionError", () =>
              Effect.logWarning("History marker close failed"),
            ),
          ),
      );
      const metadata = yield* connectionAttempt("history.marker-stat", () => file.stat());
      if (!metadata.isFile() || metadata.size > 1024 || (metadata.mode & 0o077) !== 0)
        return yield* conflict("history.marker-unsafe");
      const bytes = Buffer.alloc(1025);
      const read = yield* connectionAttempt("history.marker-read", () =>
        file.read(bytes, 0, bytes.length, 0),
      );
      if (read.bytesRead > 1024) return yield* conflict("history.marker-oversized");
      return yield* Schema.decodeUnknownEffect(binding)(
        bytes.toString("utf8", 0, read.bytesRead),
      ).pipe(
        Effect.mapError(
          (cause) => new InspectionConnectionError({ operation: "history.marker-invalid", cause }),
        ),
      );
    }),
  ),
);

/** A foreign/unsafe directory is never repaired by deleting history. */
function conflict(operation: string) {
  return Effect.fail(
    new InspectionConnectionError({
      operation,
      cause: new Error(
        "History belongs to another project or is unsafe; choose a dedicated history directory.",
      ),
    }),
  );
}
