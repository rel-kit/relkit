import { describe, expect, it } from "vitest";
import { SnapshotReadinessRequests } from "../../src/dev-snapshot/snapshot-readiness-requests.js";
import type { StartedCandidate } from "@relkit/supervisor";

const candidate = {
  token: { sourceToken: 1, generationToken: 2 },
} as StartedCandidate;

describe("SnapshotReadinessRequests", () => {
  it("releases the verified public response only after publication", async () => {
    const requests = new SnapshotReadinessRequests("/hello?name=RelKit");
    const response = requests.intercept(new Request("http://127.0.0.1:3000/hello?name=RelKit"));
    expect(response).toBeDefined();
    expect((await requests.claim(candidate))?.url).toContain("/hello?name=RelKit");
    requests.stage(candidate, {
      status: 200,
      body: '{"message":"Hello, RelKit!"}',
      response: Response.json({ message: "Hello, RelKit!" }),
    });
    let settled = false;
    void response!.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    requests.publish(candidate);
    expect(await response!.then((value) => value.text())).toBe('{"message":"Hello, RelKit!"}');
  });

  it("rejects a retained caller when publication is refused", async () => {
    const requests = new SnapshotReadinessRequests("/hello?name=RelKit");
    const response = requests.intercept(new Request("http://127.0.0.1:3000/hello?name=RelKit"));
    await requests.claim(candidate);
    requests.reject(candidate);
    expect((await response!).status).toBe(503);
  });

  it("does not intercept unrelated or later requests", () => {
    const requests = new SnapshotReadinessRequests("/hello?name=RelKit");
    expect(requests.intercept(new Request("http://127.0.0.1:3000/other"))).toBeUndefined();
    expect(
      requests.intercept(new Request("http://127.0.0.1:3000/hello?name=RelKit")),
    ).toBeDefined();
    expect(
      requests.intercept(new Request("http://127.0.0.1:3000/hello?name=RelKit")),
    ).toBeUndefined();
  });

  it("claims the next polling request when verification reaches the gap", async () => {
    const requests = new SnapshotReadinessRequests("/hello?name=RelKit");
    const claimed = requests.claim(candidate);
    const response = requests.intercept(new Request("http://127.0.0.1:3000/hello?name=RelKit"));
    expect((await claimed)?.url).toContain("/hello?name=RelKit");
    requests.reject(candidate);
    expect((await response!).status).toBe(503);
  });

  it("stops intercepting when direct verification wins the bounded claim window", async () => {
    const requests = new SnapshotReadinessRequests("/hello?name=RelKit");
    expect(await requests.claim(candidate)).toBeUndefined();
    expect(
      requests.intercept(new Request("http://127.0.0.1:3000/hello?name=RelKit")),
    ).toBeUndefined();
  });
});
