import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  acquireLocalProjectLease,
  createLocalProjectIdentity,
  readLocalProjectLease,
} from "./src/runtime/index.ts";

test("adopts detached leases and restores detached ownership on release", () => {
  const root = project();
  try {
    const identity = createLocalProjectIdentity(root, "commerce");
    acquireLocalProjectLease(identity, { mode: "detached", sessionId: "detached-one" });
    const attached = acquireLocalProjectLease(identity, {
      mode: "attached",
      sessionId: "dev-one",
      pid: 101,
      isProcessAlive: () => false,
    });

    expect(attached.status).toBe("adopted");
    expect(readLocalProjectLease(identity)).toMatchObject({ mode: "attached", ownerPid: 101 });
    attached.release();
    expect(readLocalProjectLease(identity)).toMatchObject({
      mode: "detached",
      sessionId: "detached-one",
    });
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("refuses live owners and recovers dead attached owners", () => {
  const root = project();
  try {
    const identity = createLocalProjectIdentity(root, "commerce");
    acquireLocalProjectLease(identity, {
      mode: "attached",
      sessionId: "owner-one",
      pid: 101,
      isProcessAlive: (pid) => pid === 101,
    });
    expect(() =>
      acquireLocalProjectLease(identity, {
        mode: "attached",
        sessionId: "owner-two",
        pid: 202,
        isProcessAlive: (pid) => pid === 101,
      }),
    ).toThrow(expect.objectContaining({ code: "RELKIT_LOCAL_LEASE_HELD" }));

    const recovered = acquireLocalProjectLease(identity, {
      mode: "attached",
      sessionId: "owner-two",
      pid: 202,
      isProcessAlive: () => false,
    });
    expect(recovered.status).toBe("recovered");
    expect(recovered.lease).toMatchObject({ sessionId: "owner-two", ownerPid: 202 });
    recovered.release();
    expect(readLocalProjectLease(identity)).toBeUndefined();
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

function project(): string {
  const root = mkdtempSync(join(tmpdir(), "relkit-local-lease-"));
  mkdirSync(join(root, "src"));
  return root;
}
