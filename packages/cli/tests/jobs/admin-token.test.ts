/** Native jobs use only the explicit admin bearer and preserve issued identity and operation IDs. */
import { expect, test, vi } from "vitest";
import { Effect } from "effect";
import { CliHttp } from "../../src/services/http.service.js";
import { fetchJobsJsonEffect } from "../../src/commands/jobs-http.js";
import { parse } from "../../src/commands/jobs-support.js";

test.each([undefined, "native-admin"])(
  "native token %s never substitutes an inspector credential",
  async (token) => {
    vi.stubEnv("RELKIT_INTERNAL_ENDPOINT_TOKEN", token);
    vi.stubEnv("RELKIT_INSPECTOR_SESSION_TOKEN", "must-not-forward");
    const requests: Request[] = [];
    try {
      await Effect.runPromise(
        fetchJobsJsonEffect(
          "http://127.0.0.1:3000",
          parse(["retry", "--run-id", "one", "--operation-id", "exact-operation"]),
          "POST",
          "/jobs/runs/one/retry",
        ).pipe(
          Effect.provideService(CliHttp, {
            request: (url, init) =>
              Effect.sync(() => {
                const request = new Request(String(url), init);
                requests.push(request);
                return request.url.endsWith("/client/identity")
                  ? Response.json(
                      {
                        identityScope: "issued",
                        sessionEpoch: "epoch",
                        publicFingerprint: "fingerprint",
                      },
                      { headers: { "set-cookie": "session=original; Path=/" } },
                    )
                  : Response.json({ ok: true });
              }),
            json: (response) => Effect.promise(() => response.json()),
            text: () => Effect.die("must not read text"),
          }),
        ),
      );
      expect(requests).toHaveLength(2);
      const headers = requests[1]!.headers;
      expect(headers.get("authorization")).toBe(token === undefined ? null : `Bearer ${token}`);
      expect(headers.get("x-relkit-operation-id")).toBe("exact-operation");
      expect(headers.get("cookie")).toBe("session=original");
      expect(headers.get("x-relkit-identity-scope")).toBe("issued");
      expect(JSON.stringify([...headers])).not.toContain("must-not-forward");
    } finally {
      vi.unstubAllEnvs();
    }
  },
);
