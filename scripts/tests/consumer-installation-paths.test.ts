/** Keeps every transitive physical import route visible without counting shared bytes twice. */
import { Effect } from "effect";
import { realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { inspectInstallation } from "../consumer-installation.js";
import { dependencyViolations } from "../consumer-dependency-policy.js";
import { installationPathsFixture } from "./consumer-installation-paths.fixture.js";
import { moduleGraphFixture } from "./consumer-module-paths.fixture.js";
import { projectInstallationPaths } from "../consumer-installation-paths.js";

test("shared CLI ancestry cannot hide a later application's forbidden descendant route", async () => {
  const fixture = installationPathsFixture();
  try {
    const installation = await Effect.runPromise(inspectInstallation(fixture.root));
    const cli = {
      boundary: "installation" as const,
      packages: ["consumer", "@relkit/cli", "fixture-common", "react"],
    };
    const app = {
      boundary: "installation" as const,
      packages: ["consumer", "fixture-app", "fixture-common", "react"],
    };
    expect(installation.paths).toContainEqual(cli);
    expect(installation.paths).toContainEqual(app);
    expect(
      dependencyViolations(installation.paths, { stage: "1", exceptions: [], selected: [cli] }),
    ).toContainEqual(app);
    expect(installation.instances.filter((item) => item.name === "fixture-common")).toHaveLength(1);
    expect(installation.edges.filter((edge) => edge.name === "fixture-common")).toHaveLength(2);
  } finally {
    fixture.close();
  }
});

test("installed native manifest identity remains visible through a package alias", async () => {
  const fixture = installationPathsFixture();
  try {
    const installation = await Effect.runPromise(inspectInstallation(fixture.root));
    const aliased = { boundary: "installation" as const, packages: ["consumer", "react"] };
    expect(installation.paths).toContainEqual(aliased);
    expect(dependencyViolations(installation.paths, { stage: "1", exceptions: [] })).toContainEqual(
      aliased,
    );
  } finally {
    fixture.close();
  }
});

test("borrowed optional peers retain raw edges while unowned peers retain installation cost", async () => {
  const fixture = installationPathsFixture();
  try {
    writeFileSync(
      join(fixture.root, "node_modules/fixture-app/package.json"),
      JSON.stringify({
        name: "fixture-app",
        version: "1.0.0",
        peerDependencies: { react: "1.0.0" },
        peerDependenciesMeta: { react: { optional: true } },
      }),
    );
    const installation = await Effect.runPromise(inspectInstallation(fixture.root));
    const peer = installation.edges.find(
      (edge) => edge.from.endsWith("/fixture-app") && edge.name === "react",
    );
    expect(peer).toMatchObject({ optionalPeer: true });
    const borrowed = {
      boundary: "installation" as const,
      packages: ["consumer", "fixture-app", "react"],
    };
    expect(installation.paths).not.toContainEqual(borrowed);
    if (peer === undefined) throw new Error("Expected the resolved optional peer edge");
    const unowned = projectInstallationPaths(
      realpathSync(fixture.root),
      "consumer",
      installation.edges.filter((edge) => edge === peer || edge.to !== peer.to),
      installation.instances,
    );
    expect(unowned).toContainEqual(borrowed);
    expect(dependencyViolations(unowned, { stage: "1", exceptions: [] })).toContainEqual(borrowed);
  } finally {
    fixture.close();
  }
});

test("physical dependency cycles retain the closing edge and terminate", () => {
  const fixture = moduleGraphFixture(2);
  try {
    const first = fixture.installation.instances[0];
    const second = fixture.installation.instances[1];
    if (first === undefined || second === undefined)
      throw new Error("Expected physical fixture packages");
    const edges = [
      { from: fixture.root, to: first.physicalPath, name: first.name },
      { from: first.physicalPath, to: second.physicalPath, name: second.name },
      { from: second.physicalPath, to: first.physicalPath, name: first.name },
    ];
    const paths = projectInstallationPaths(
      fixture.root,
      "consumer",
      edges,
      fixture.installation.instances,
    );
    expect(paths).toHaveLength(3);
    expect(paths[2]?.packages).toEqual(["consumer", "fixture-0", "fixture-1", "fixture-0"]);
  } finally {
    fixture.close();
  }
});

test("installation diamond projection rejects exponential evidence within a finite path budget", () => {
  const fixture = moduleGraphFixture(32);
  try {
    let previous = [fixture.root];
    const edges: { from: string; to: string; name: string }[] = [];
    for (let layer = 0; layer < fixture.modules.length; layer += 2) {
      const next = fixture.installation.instances
        .slice(layer, layer + 2)
        .map((item) => item.physicalPath);
      for (const from of previous) for (const to of next) edges.push({ from, to, name: "fixture" });
      previous = next;
    }
    expect(() =>
      projectInstallationPaths(fixture.root, "consumer", edges, fixture.installation.instances),
    ).toThrow("Installation graph path budget exceeded");
  } finally {
    fixture.close();
  }
});
