/** Exercises the complete isolated preview/confirmation/update/no-op sequence with redacted reports and bounded cleanup. */
import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "bun:test";
import { createState } from "./preview-command.ts";
import { boundedRemove } from "./preview.fixture.ts";
import {
  initializePreview,
  firstPreview,
  declinePreview,
  applyPreview,
  repeatPreview,
} from "./preview-phases.ts";
test("previews an isolated stack with redacted events, confirmation, and a no-op repeat", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-preview-"));
  const stack = `preview-${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  const state = createState(stack);

  try {
    await initializePreview(root, stack, state);
    await firstPreview(root, stack, state);
    await declinePreview(root, stack, state);
    await applyPreview(root, stack, state);
    await repeatPreview(root, stack, state);
  } finally {
    await boundedRemove(root);
  }
});
