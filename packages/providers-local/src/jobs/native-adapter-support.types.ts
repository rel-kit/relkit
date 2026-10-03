import type { LOCAL_SLEEP_SUSPENSION_CODE } from "./native-adapter-support.js";

/** Serializable marker identifying a durable sleep checkpoint and wake instant. */
export interface LocalSleepSuspension {
  readonly code: typeof LOCAL_SLEEP_SUSPENSION_CODE;
  readonly key: string;
  readonly wakeAt: string;
}
