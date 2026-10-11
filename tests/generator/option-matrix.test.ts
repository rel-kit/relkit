/**
 * Covers creation templates and options using complete per-tuple assertions.
 * Subprocesses are injected while real generated files and atomic publication
 * are verified; shared fixtures own all temporary directory cleanup.
 */
import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CREATE_TEMPLATES, generateProject } from "../../packages/create-relkit/src/index.ts";
import {
  makeRoot,
  contextFor,
  createOptions,
  templateRoot,
  snapshotProject,
} from "./option-matrix-fixture.js";
import { verifyCreationTuple } from "./option-matrix-cohort.js";

test("covers every template and examples/install/Git combination", async () => {
  const root = await makeRoot();
  for (const template of CREATE_TEMPLATES) {
    for (const examples of [false, true]) {
      for (const install of [false, true]) {
        for (const git of [false, true]) {
          await verifyCreationTuple(root, { template, examples, install, git });
        }
      }
    }
  }
});

test("agent starters ship executable native and typed client examples", async () => {
  const agent = await readFile(
    join(templateRoot, "agent/src/hello/agents/assistant.agent.ts"),
    "utf8",
  );
  const graph = await readFile(
    join(templateRoot, "agent/src/hello/agents/review.agent.ts"),
    "utf8",
  );
  const page = await readFile(join(templateRoot, "fullstack/web/app/page.tsx"), "utf8");
  const providers = await readFile(join(templateRoot, "fullstack/web/app/providers.tsx"), "utf8");

  expect(agent).toContain("todoListMiddleware()");
  expect(agent).not.toContain("@relkit/ai-sdk");
  expect(graph).toContain("new MemorySaver()");
  expect(graph).toContain("interrupt(");
  expect(page).toContain("threadId: agentThreadIds.assistant");
  expect(page).toContain("resume: true");
  expect(page).toContain("assistant.values?.todos");
  expect(providers).toContain('useState<AgentTransport>("sse")');
  expect(providers).toContain("transport={transport}");
});

test("reports only the create milestones that run", async () => {
  const root = await makeRoot();
  const full: string[] = [];
  await generateProject(createOptions("full-progress"), {
    ...contextFor(root),
    onProgress: (message) => full.push(message),
  });
  expect(full).toEqual([
    `Creating a new RELKIT app in ${join(root, "full-progress")}.`,
    "Installing dependencies...",
    "Initializing Git repository...",
    "Checking prerequisites...",
    "Checking and preparing development snapshot...",
  ]);

  const minimal: string[] = [];
  await generateProject(createOptions("minimal-progress", { install: false, git: false }), {
    ...contextFor(root),
    onProgress: (message) => minimal.push(message),
  });
  expect(minimal).toEqual([`Creating a new RELKIT app in ${join(root, "minimal-progress")}.`]);
});

test("produces byte-identical content from separate destinations", async () => {
  const root = await makeRoot();
  const options = createOptions("deterministic-app", { install: false, git: false });
  const first = await generateProject(options, contextFor(root));
  const second = await generateProject({ ...options, directory: "second" }, contextFor(root));
  expect(await snapshotProject(first.destination)).toEqual(
    await snapshotProject(second.destination),
  );
});
