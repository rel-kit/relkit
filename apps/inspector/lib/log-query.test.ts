import { expect, test } from "bun:test";
import { logQuery, logQueryKey } from "./log-query";

test("logs default to rolling application history and retain cursor identity in URL filters", () => {
  const now = Date.parse("2026-09-03T12:00:00Z");
  expect(logQuery(new URLSearchParams(), now)).toEqual({
    source: "application",
    order: "desc",
    limit: 50,
    from: "2026-09-02T12:00:00.000Z",
  });
  const params = new URLSearchParams(
    "source=all&search=ALICE&log=77&cursor=100&severity=debug&range=15m",
  );
  expect(logQuery(params, now)).toMatchObject({
    cursor: "100",
    search: "ALICE",
    severity: "debug",
    from: "2026-09-03T11:45:00.000Z",
  });
  expect(logQuery(params).source).toBeUndefined();
  expect(logQueryKey(params)).not.toContain("log=");
});
