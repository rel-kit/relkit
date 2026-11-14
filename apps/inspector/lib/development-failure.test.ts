import { expect, test } from "bun:test";
import { failureRefresh } from "./development-failure";

test("a generation or diagnostic change re-reads the reload status at once", () => {
  expect(failureRefresh("generation.changed")).toBe("now");
  expect(failureRefresh("diagnostic.changed")).toBe("now");
});

test("new logs re-read it later, since a failed reload is only a supervisor log", () => {
  expect(failureRefresh("log.emitted")).toBe("later");
});

test("traffic does not read it", () => {
  for (const type of ["request.completed", "span.updated", "job.changed"] as const)
    expect(failureRefresh(type)).toBeUndefined();
});
