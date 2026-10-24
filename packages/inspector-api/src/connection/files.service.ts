/**
 * Exposes session-owned private descriptor I/O through a substitutable service.
 * Native publication validates directory containment and ownership; discovery
 * reads only metadata and never imports application configuration.
 */
import { Context, Effect, Layer } from "effect";
import { inspectionProjectId, readInspectionFile } from "./files-native.js";
import {
  publishInspectionFile,
  listInspectionFiles,
  removeOwnedInspectionFile,
} from "./files-publish.js";
import type { InspectionFilesOperations } from "./protocol.types.js";

/** Private discovery authority acquired once by a bridge or standalone tool. */
export class InspectionFiles extends Context.Service<InspectionFiles, InspectionFilesOperations>()(
  "relkit/inspection/Files",
  {
    make: Effect.succeed({
      projectId: inspectionProjectId,
      publish: publishInspectionFile,
      read: (path) =>
        readInspectionFile(path).pipe(Effect.map(({ path, descriptor }) => ({ path, descriptor }))),
      list: listInspectionFiles,
      removeOwned: removeOwnedInspectionFile,
    } satisfies InspectionFilesOperations),
  },
) {}

/** Live descriptor authority; construction itself creates no files. */
export const InspectionFilesLive = Layer.effect(InspectionFiles, InspectionFiles.make);
