import type {
  SupervisorDrainAction,
  SupervisorDrainCleanupStatus,
  SupervisorDrainResource,
} from "./drain-types.js";

export interface SupervisorDrainCleanupResult {
  readonly status: SupervisorDrainCleanupStatus;
  readonly message?: string;
}

export async function closeAction(
  id: string,
  action: SupervisorDrainAction | undefined,
  deadlineAt: number,
  now: () => number,
): Promise<SupervisorDrainCleanupResult> {
  if (action === undefined) return { status: "not-configured" };
  let operation: void | PromiseLike<void>;
  try {
    operation = action();
  } catch (error) {
    return { status: "failed", message: `${id}: ${errorMessage(error)}`.slice(0, 256) };
  }
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (result: SupervisorDrainCleanupResult): void => {
      if (timer !== undefined) clearTimeout(timer);
      resolve(result);
    };
    timer = setTimeout(() => finish({ status: "timed-out" }), Math.max(0, deadlineAt - now()));
    Promise.resolve(operation).then(
      () => finish({ status: "closed" }),
      (error) =>
        finish({ status: "failed", message: `${id}: ${errorMessage(error)}`.slice(0, 256) }),
    );
  });
}

export function resourceAction(
  resource: SupervisorDrainResource,
): SupervisorDrainAction | undefined {
  return resource.close ?? resource.release ?? resource.dispose;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Resource cleanup failed.";
}
