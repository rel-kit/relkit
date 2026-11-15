/**
 * IN-08: the Inspector's own calls keep one anonymous identity with the application. The tool
 * keeps the cookies the application's identity endpoint sets in its own jar, sends them back on
 * its later calls, and never forwards the cookies the browser holds for the application.
 */
import { expect, test } from "vitest";
import { Effect } from "effect";
import type { InspectionConnectionFile } from "relkit/inspector-api/connection";
import { CLIENT_IDENTITY_PATH as APPLICATION_IDENTITY_PATH } from "relkit/runtime-hono";
import {
  CLIENT_IDENTITY_PATH,
  makeApplicationIdentityJar,
} from "../src/application-identity.js";
import { forwardBackend } from "../src/backend-forward.js";
import type { InspectorRemoteOperations } from "../src/remote.types.js";

const project = `sha256:${"a".repeat(64)}`;
const connection: InspectionConnectionFile = {
  path: "/private/connection.json",
  descriptor: {
    protocol: 1,
    projectId: project,
    sessionId: "312b0cb1-81bb-4b99-81b7-5812a720782b",
    endpoint: "http://127.0.0.1:43100",
    token: "a".repeat(43),
    createdAt: "2026-10-23T00:00:00.000Z",
    process: { pid: 1, startedAt: "2026-10-23T00:00:00.000Z" },
  },
};

test("the identity path is the application's", () => {
  expect(CLIENT_IDENTITY_PATH).toBe(APPLICATION_IDENTITY_PATH);
});

test("the jar keeps set cookies per project, replaces, expires and bounds them", () => {
  const jar = makeApplicationIdentityJar();
  expect(jar.cookie(project)).toBeUndefined();
  jar.keep(project, [
    "relkit_visitor=v1; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000",
    "relkit_csrf=c1; Path=/; SameSite=Lax; Max-Age=2592000",
    "bad name=x",
    "empty",
    `big=${"x".repeat(5000)}`,
  ]);
  expect(jar.cookie(project)).toBe("relkit_visitor=v1; relkit_csrf=c1");
  expect(jar.cookie("sha256:other")).toBeUndefined();
  jar.keep(project, ["relkit_visitor=v2; Path=/", "relkit_csrf=; Max-Age=0"]);
  expect(jar.cookie(project)).toBe("relkit_visitor=v2");
  jar.keep(project, ["relkit_visitor=v3; Expires=Thu, 01 Jan 1970 00:00:00 GMT"]);
  expect(jar.cookie(project)).toBeUndefined();
  jar.keep(
    project,
    Array.from({ length: 40 }, (_, index) => `c${index}=${index}`),
  );
  expect(jar.cookie(project)?.split("; ")).toHaveLength(16);
});

test("identity cookies are kept by the tool, sent back, and the browser's are not forwarded", async () => {
  const seen: { path: string; cookie: string | null }[] = [];
  const remote: InspectorRemoteOperations = {
    request: (_connection, path, options) =>
      Effect.sync(() => {
        const cookie = new Headers(options?.headers).get("cookie");
        seen.push({ path, cookie });
        const headers = new Headers({ "content-type": "application/json" });
        if (path === CLIENT_IDENTITY_PATH && cookie === null) {
          headers.append("set-cookie", "relkit_visitor=tool-visitor; Path=/; HttpOnly");
          headers.append("set-cookie", "relkit_csrf=tool-csrf; Path=/");
        }
        return new Response(JSON.stringify({ identityScope: "scope" }), { headers });
      }),
    json: (response) => Effect.promise(() => response.text()),
  };
  const jar = makeApplicationIdentityJar();
  const browser = { cookie: "relkit_visitor=browser-visitor; better-auth.session_token=secret" };
  const call = (path: string, method = "GET") =>
    Effect.runPromise(
      forwardBackend(
        remote,
        connection,
        new Request(`http://localhost${path}`, {
          method,
          headers: browser,
          ...(method === "GET" ? {} : { body: "{}" }),
        }),
        undefined,
        jar,
      ),
    );
  const first = await call(CLIENT_IDENTITY_PATH);
  // The browser never receives them: cookies ignore the port, so they would land on the
  // application's host and replace the developer's own.
  expect(first.headers.getSetCookie()).toEqual([]);
  expect(await first.json()).toEqual({ identityScope: "scope" });
  await call(CLIENT_IDENTITY_PATH);
  await call("/_relkit/v1/rpc/relkit.realtime.subscribe", "POST");
  expect(seen).toEqual([
    { path: CLIENT_IDENTITY_PATH, cookie: null },
    { path: CLIENT_IDENTITY_PATH, cookie: "relkit_visitor=tool-visitor; relkit_csrf=tool-csrf" },
    {
      path: "/_relkit/v1/rpc/relkit.realtime.subscribe",
      cookie: "relkit_visitor=tool-visitor; relkit_csrf=tool-csrf",
    },
  ]);
});

test("cookies set by any other call are not kept", async () => {
  const remote: InspectorRemoteOperations = {
    request: () =>
      Effect.sync(
        () =>
          new Response("{}", {
            headers: { "set-cookie": "better-auth.session_token=signed-in; Path=/" },
          }),
      ),
    json: (response) => Effect.promise(() => response.text()),
  };
  const jar = makeApplicationIdentityJar();
  await Effect.runPromise(
    forwardBackend(
      remote,
      connection,
      new Request("http://localhost/api/auth/sign-in/email", { method: "POST", body: "{}" }),
      undefined,
      jar,
    ),
  );
  expect(jar.cookie(project)).toBeUndefined();
});
