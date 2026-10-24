/**
 * Carries machine headroom observed immediately before a serial measurement.
 * macOS pressure uses its native 1/2/4 normal/warning/critical level; other hosts
 * report normal pressure and still enforce their CPU and disk headroom checks.
 */

import type { Effect } from "effect";
import type { ConsumerInspectionError } from "./consumer-installation-native.js";

/** Resource admission inputs, with byte and load units explicit. */
export interface ConsumerResources {
  readonly cpus: number;
  readonly load: number;
  readonly pressure: number;
  readonly availableDiskBytes: number;
}

/** Fresh safety decision; never cached across fixture admissions. */
export interface ConsumerResourceAdmission {
  readonly resources: ConsumerResources;
  readonly blocked: string | null;
}

/** Substitutable resource authority captured by the fixture service. */
export interface ConsumerResourceMonitorContract {
  /**
   * Reads current capacity without mutating system settings.
   * @param directory - Fixture volume used for available disk accounting.
   * @returns Lazy snapshot or typed native probe failure.
   */
  readonly inspect: (
    directory: string,
  ) => Effect.Effect<ConsumerResourceAdmission, ConsumerInspectionError>;
}
