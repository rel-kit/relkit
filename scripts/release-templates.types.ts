/**
 * Shares the finite release-template identity with smoke and manifest checks.
 * The type derives from the pure inventory; it carries no installed-project or
 * timing certification authority and acquires no resources.
 */
import type { packedTemplates } from "./release-templates.js";

/** Public templates plus the legacy task starter exercised by packaging checks. */
export type ReleaseTemplate = (typeof packedTemplates)[number];
