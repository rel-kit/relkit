/** Owns the native authored-byte seam used by migration planning, publication and recovery. */
import { chmod, mkdir, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Context, Effect, Layer } from "effect";
import { cliPromise } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import { inventoryMigrationFiles, readMigrationFile } from "./layout-files-native.js";
import type { MigrationFileOperations, MigrationFile } from "./layout.types.js";
import { migrationNativePath } from "./layout-native-path.js";

/** Replaceable file-byte authority; filesystem mutation settles before recovery runs. */
export class LayoutFiles extends Context.Service<LayoutFiles, MigrationFileOperations>()(
  "relkit/cli/LayoutFiles",
  {
    /** Acquires stateless native adapters without touching project files. */
    make: Effect.sync(
      () =>
        ({
          inventory: Effect.fn("LayoutFiles.inventory")((root: string) =>
            observeCli(
              "migration.files.inventory",
              cliPromise("migration.inventory", () => inventoryMigrationFiles(root)),
            ),
          ),
          read: Effect.fn("LayoutFiles.read")((root: string, path: string) =>
            observeCli(
              "migration.files.read",
              cliPromise("migration.read", () => readMigrationFile(root, path)),
            ),
          ),
          put: Effect.fn("LayoutFiles.put")((root: string, file: MigrationFile) =>
            observeCli(
              "migration.files.put",
              cliPromise("migration.put", async () => {
                const path = await migrationNativePath(root, file.path);
                await mkdir(dirname(path), { recursive: true });
                await writeFile(path, Buffer.from(file.bytes, "base64"));
                await chmod(path, file.mode);
              }).pipe(Effect.uninterruptible),
            ),
          ),
          remove: Effect.fn("LayoutFiles.remove")((root: string, path: string) =>
            observeCli(
              "migration.files.remove",
              cliPromise("migration.remove", async () =>
                unlink(await migrationNativePath(root, path)),
              ).pipe(Effect.uninterruptible),
            ),
          ),
        }) satisfies MigrationFileOperations,
    ),
  },
) {}
export const layoutFilesLayer = Layer.effect(LayoutFiles, LayoutFiles.make);
