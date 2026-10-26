/**
 * Verifies the benchmark stops admitting work when system headroom disappears.
 * These pure cases catch starting installs during warning pressure, saturated
 * CPU load or low disk space without changing machine-wide settings.
 */
import { describe, expect, it } from "vitest";
import { consumerResourceBlock } from "../consumer-resources.js";

const normal = { cpus: 10, load: 4, pressure: 1, availableDiskBytes: 10 * 1024 ** 3 };

describe("consumer measurement resource admission", () => {
  it("admits one serial task when headroom exists", () => {
    expect(consumerResourceBlock(normal)).toBeNull();
  });

  it("backs off at warning pressure even with idle CPUs", () => {
    expect(consumerResourceBlock({ ...normal, pressure: 2 })).toMatch(/memory pressure/);
  });

  it("leaves CPU capacity for the user's work", () => {
    expect(consumerResourceBlock({ ...normal, load: 9 })).toMatch(/CPU/);
  });

  it("does not fill the remaining disk with a new fixture", () => {
    expect(consumerResourceBlock({ ...normal, availableDiskBytes: 3 * 1024 ** 3 })).toMatch(/disk/);
  });
});
