import { expect, test } from "bun:test";
import { failureRefresh, loadDevelopmentFailure } from "./development-failure";

test("a generation or diagnostic change re-reads the reload status at once", () => {
  expect(failureRefresh("generation.changed")).toBe("now");
  expect(failureRefresh("diagnostic.changed")).toBe("now");
});

test("new logs re-read it later, since a failed reload is only a supervisor log", () => {
  expect(failureRefresh("log.emitted")).toBe("later");
});

function client(items: readonly Record<string, unknown>[]) {
  return {
    query: async (_kind: string, query: { search?: string }) => ({
      items: query.search === "dev.generation." ? items : [],
    }),
  } as unknown as Parameters<typeof loadDevelopmentFailure>[0];
}

const failed = {
  origin: "relkit",
  component: "cli.dev",
  cursor: "2",
  message: "dev.generation.failed",
  fields: {
    message: "Candidate validation failed.",
    cause: "src/a.ts(1,1): error TS1005\n\nsecond line\nthird\nfourth",
    runId: "r",
    reason: "reload",
  },
};

test("a failed reload shows its message and the first lines of its cause", async () => {
  const failure = await loadDevelopmentFailure(client([failed]));
  expect(failure?.message).toBe("Candidate validation failed.");
  expect(failure?.details).toEqual(["src/a.ts(1,1): error TS1005", "second line", "third"]);
});

test("a successful in-process reload after a failure clears it", async () => {
  const swapped = {
    origin: "relkit",
    component: "cli.dev",
    cursor: "3",
    message: "dev.generation.swapped",
    fields: { changedFiles: 1, runId: "r", reason: "reload" },
  };
  expect(await loadDevelopmentFailure(client([swapped, failed]))).toBeUndefined();
});

test("traffic does not read it", () => {
  for (const type of ["request.completed", "span.updated", "job.changed"] as const)
    expect(failureRefresh(type)).toBeUndefined();
});
