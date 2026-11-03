import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CREATE_CAPABILITY_TABLE,
  CREATE_UNTESTED_DOCS,
  CreateUntestedError,
  assertCreateCapability,
  checkCreateCapability,
  currentCreateCapabilityIdentity,
  supportedCreateTemplates,
} from "../src/create-capabilities.js";

const identity = CREATE_CAPABILITY_TABLE.entries[0]!.identity;
const supported = {
  template: "minimal",
  cloud: "none",
  deploy: "none",
  examples: true,
} as const;

describe("creation capability evidence", () => {
  it("reports the default combination as tested for the packaged release identity", () => {
    expect(() => assertCreateCapability(supported)).not.toThrow();
    expect(identity).toEqual(currentCreateCapabilityIdentity());
    expect(supportedCreateTemplates({ cloud: "none", deploy: "none", examples: true })).toEqual([
      "minimal",
    ]);
  });

  it("matches evidence by release, template and runtime major.minor", () => {
    expect(checkCreateCapability(supported, { identity })).toBeUndefined();
    expect(checkCreateCapability(supported, { identity: { ...identity, bun: "1.3.11" } })).toBe(
      undefined,
    );
    expect(
      checkCreateCapability(supported, {
        identity: { ...identity, typescript: "5.9.4", packageCatalogDigest: "other" },
      }),
    ).toBeUndefined();
    expect(checkCreateCapability(supported, { identity: { ...identity, bun: "1.4.4" } })).toEqual({
      code: "RELKIT_CREATE_UNTESTED",
      message: expect.stringContaining("on Bun 1.4"),
      docs: CREATE_UNTESTED_DOCS,
    });
    expect(
      checkCreateCapability(supported, { identity: { ...identity, release: "0.7.2" } }),
    ).toMatchObject({ code: "RELKIT_CREATE_UNTESTED" });
    expect(
      checkCreateCapability(supported, {
        identity: { ...identity, template: "default/v2/minimal" },
      }),
    ).toMatchObject({ code: "RELKIT_CREATE_UNTESTED" });
  });

  it("warns about untested combinations instead of refusing them", () => {
    const warning = checkCreateCapability({ ...supported, template: "agent" });
    expect(warning).toEqual({
      code: "RELKIT_CREATE_UNTESTED",
      message: expect.stringContaining("template=agent"),
      docs: CREATE_UNTESTED_DOCS,
    });
    expect(warning?.message).toContain("pass --strict");
    expect(checkCreateCapability(supported, { identity: { ...identity, bun: "1.3.11" } })).toBe(
      undefined,
    );
  });

  it("refuses untested combinations in strict mode and lists the tested ones", () => {
    expect(() =>
      checkCreateCapability({ ...supported, template: "agent" }, { strict: true, identity }),
    ).toThrow(CreateUntestedError);
    expect(() =>
      checkCreateCapability({ ...supported, template: "agent" }, { strict: true, identity }),
    ).toThrow("Tested: template=minimal/jobs=none/cloud=none/deploy=none/examples=on");
    expect(() => assertCreateCapability(supported, { ...identity, bun: "1.4.4" })).toThrow(
      "none for this RelKit and Bun version",
    );
    expect(() => assertCreateCapability(supported, { ...identity, bun: "1.3.11" })).not.toThrow();
  });

  it("filters partial interactive choices with the same table", () => {
    expect(
      supportedCreateTemplates({ cloud: "none", deploy: "none", examples: true }, identity),
    ).toEqual(["minimal"]);
    expect(
      supportedCreateTemplates({ cloud: "aws", deploy: "none", examples: true }, identity),
    ).toEqual([]);
  });

  it("pins the measured source template bytes", () => {
    const root = join(import.meta.dirname, "../../../templates/default/v1/minimal");
    expect(templateDigest(root)).toBe(CREATE_CAPABILITY_TABLE.entries[0]!.templateDigest);
  });

  it("gates every table entry on a committed passing evidence summary", () => {
    const root = join(import.meta.dirname, "../../..");
    for (const entry of CREATE_CAPABILITY_TABLE.entries) {
      const release = entry.identity.release;
      expect(entry.freshEvidence).toBe(`create-capabilities/${release}/fresh.json`);
      expect(entry.restartEvidence).toBe(`create-capabilities/${release}/restart.json`);
      const summary = readFileSync(
        join(root, "docs/evidence/create-capabilities", `${release}.md`),
        "utf8",
      );
      expect(summary).toContain(`# create-relkit ${release} creation evidence`);
      expect(summary).toContain(`Bun ${entry.identity.bun}`);
      expect(summary).toMatch(/^\|\s*fresh\s*\|\s*20\s*\|\s*passed\s*\|/mu);
      expect(summary).toMatch(/^\|\s*restart\s*\|\s*20\s*\|\s*passed\s*\|/mu);
    }
  });
});

function templateDigest(root: string): string {
  const hash = createHash("sha256");
  for (const path of paths(root)) {
    hash.update(relative(root, path).replaceAll("\\", "/"));
    hash.update("\0");
    hash.update(readFileSync(path));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function paths(root: string): readonly string[] {
  return readdirSync(root, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(root, entry.name);
      return entry.isDirectory() ? paths(path) : [path];
    })
    .sort();
}
