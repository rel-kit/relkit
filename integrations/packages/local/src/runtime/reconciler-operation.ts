import type { LocalServiceInstance } from "@relkit/local-service";
import type {
  LocalServiceReconcileRequest,
  LocalServiceReconcilerOptions,
} from "./reconciler-types.js";
import { runReconcileOperation } from "./reconciler-operation-run.js";

export interface TrackedService {
  readonly instance: LocalServiceInstance;
  readonly signature: string;
  readonly secrets: Readonly<Record<string, string>>;
  readonly owned: boolean;
}

export function createReconcileOperation(
  options: LocalServiceReconcilerOptions,
  projectLabels: Readonly<Record<string, string>>,
  tracked: Map<string, TrackedService>,
  signatures: Map<string, string>,
  isClosed: () => boolean,
) {
  return (request: LocalServiceReconcileRequest) =>
    runReconcileOperation(options, projectLabels, tracked, signatures, isClosed, request);
}
