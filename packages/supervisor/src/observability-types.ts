import type { MaybePromise, RuntimeActivationFingerprint } from "@relkit/contracts";
import type {
  ObservabilityCollector,
  ObservabilityRecord,
  ObservabilityStream,
  RedactionPolicy,
} from "@relkit/observability";
import type {
  SupervisorCandidateToken,
  SupervisorTelemetry,
  SupervisorTelemetryListener,
} from "./state-machine-types.js";

export type SupervisorActivationFingerprint =
  | RuntimeActivationFingerprint
  | ((
      token: SupervisorCandidateToken,
      event: SupervisorTelemetry,
    ) => RuntimeActivationFingerprint | undefined);

export interface SupervisorObservabilityOptions {
  readonly activationFingerprint: SupervisorActivationFingerprint;
  readonly collector?: Pick<ObservabilityCollector, "collect">;
  readonly stream?: Pick<ObservabilityStream, "publishRecord">;
  readonly append?: (record: ObservabilityRecord) => MaybePromise<unknown>;
  readonly redaction?: RedactionPolicy;
  readonly now?: () => number;
}

export interface SupervisorObservability {
  readonly onTelemetry: SupervisorTelemetryListener;
  readonly emit: (event: SupervisorTelemetry) => void;
  readonly flush: () => Promise<void>;
}
