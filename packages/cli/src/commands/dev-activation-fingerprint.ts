import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  RUNTIME_ACTIVATION_FILE,
  isRuntimeActivationFingerprint,
  type RuntimeActivationFingerprint,
} from "@relkit/contracts";
import type { StartedCandidate } from "@relkit/supervisor";
import type { DevSession } from "./dev-session.js";

export async function resolveActivationFingerprint(
  session: DevSession,
  candidate: StartedCandidate,
): Promise<RuntimeActivationFingerprint> {
  const value = session.options.activationFingerprint;
  const fingerprint =
    value === undefined
      ? JSON.parse(
          await readFile(join(candidate.directory, "server", RUNTIME_ACTIVATION_FILE), "utf8"),
        )
      : typeof value === "function"
        ? await value(candidate)
        : value;
  if (!isRuntimeActivationFingerprint(fingerprint))
    throw new TypeError("Development candidates require an activation fingerprint.");
  return Object.freeze({ ...fingerprint });
}
