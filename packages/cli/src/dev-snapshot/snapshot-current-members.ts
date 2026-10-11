/**
 * Checks each current project/checker member exactly once per validation.
 * Shared paths must agree on their complete identity before native I/O. The single
 * finite inventory keeps per-cohort rejection policy while avoiding duplicate hashes
 * and preserving the same contained no-follow descriptor authority.
 */
import { Effect } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { DevSnapshotRejected } from "./snapshot-error.js";
import type { SnapshotFileOperations } from "./snapshot-files.types.js";
import type { DevSnapshot, SnapshotMember } from "./snapshot.types.js";

/**
 * Unifies byte reads while comparing all original owning cohort identities.
 * @param files - Acquired file authority retaining the original project root.
 * @param root - Current installed project root, including relocation.
 * @param receipt - Bounded decoded preparation evidence.
 * @returns Completion only after every source, checker and executable member matches.
 */
export const verifySnapshotCurrentMembers = Effect.fn("DevSnapshot.currentMembers")(
  function* (files: SnapshotFileOperations, root: string, receipt: DevSnapshot) {
    const dependencies = receipt.dependencies
      .filter((dependency) => dependency.root.startsWith("node_modules/"))
      .flatMap((dependency) =>
        dependency.members.map((member) => ({
          ...member,
          path: `${dependency.root}/${member.path}`,
        })),
      );
    const groups = [receipt.inputs, receipt.typecheckInputs.files, dependencies];
    const unique = new Map<string, SnapshotMember>();
    for (const group of groups) {
      for (const member of group) {
        const previous = unique.get(member.path);
        if (
          previous !== undefined &&
          (previous.bytes !== member.bytes || previous.hash !== member.hash)
        )
          return yield* rejected("integrity", "member.conflict");
        unique.set(member.path, member);
      }
    }
    const expected = [...unique.values()].sort((left, right) =>
      left.path.localeCompare(right.path),
    );
    const mismatch = yield* files.mismatch(root, expected, 67_108_864);
    if (mismatch === undefined) return;
    const path = expected[mismatch]?.path;
    if (path === undefined) return yield* rejected("integrity", "member.inventory");
    if (receipt.inputs.some((member) => member.path === path))
      return yield* rejected("stale", "inputs.identity");
    if (receipt.typecheckInputs.files.some((member) => member.path === path))
      return yield* rejected("stale", "typecheck.changed");
    return yield* rejected("integrity", "member.digest");
  },
  (effect, _files, _root, receipt) =>
    observeExecution("cli", "dev.snapshot.current-members", effect, () => ({
      source: receipt.inputs.length,
      checker: receipt.typecheckInputs.files.length,
    })),
);

/**
 * Constructs a fixed safe cohort diagnostic without path or source content.
 * @param reason - Source staleness or incompatible integrity evidence.
 * @param operation - Fixed native/domain comparison label.
 * @returns Expected validation rejection, preserving other Cause channels.
 */
function rejected(reason: "stale" | "integrity", operation: string) {
  return new DevSnapshotRejected({ reason, operation });
}
