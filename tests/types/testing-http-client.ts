import type { ProblemDetails } from "relkit/contracts";
import {
  createTestApplication,
  type TestHttpResponse,
  type TestProblemResponse,
} from "@relkit/testing";

interface Greeting {
  readonly message: string;
}

declare const app: Awaited<ReturnType<typeof createTestApplication>>;

// The default body is unknown, so a test narrows it before reading fields.
const untyped = await app.http.get("/hello");
const unknownBody: unknown = await untyped.json();
void unknownBody;
// @ts-expect-error an undeclared body is unknown, not any
void (await untyped.json()).message;

// A declared body types json() and keeps the rest of the native Response.
const typed = await app.http.get<Greeting>("/hello?name=Ada");
const message: string = (await typed.json()).message;
const status: number = typed.status;
const native: Response = typed;
const response: TestHttpResponse<Greeting> = typed;
void [message, status, native, response];
// @ts-expect-error the declared body has no total field
void (await typed.json()).total;
// @ts-expect-error a declared body is not assignable to a different shape
const wrong: TestHttpResponse<{ total: number }> = typed;
void wrong;

// Every verb and request carries the same typing, and json types the request body.
const created = await app.http.post<Greeting, { name: string }>("/hello", {
  json: { name: "Ada" },
  headers: { "x-request-id": "1" },
});
const createdMessage: string = (await created.json()).message;
void createdMessage;
const requested = await app.http.request<Greeting>("/hello", { method: "PUT" });
const replaced = await app.http.put<Greeting>("/hello");
const patched = await app.http.patch<Greeting>("/hello");
const deleted = await app.http.delete<Greeting>("/hello");
void [requested.json(), replaced.json(), patched.json(), deleted.json()];
// @ts-expect-error the json body must match the declared request shape
void app.http.post<Greeting, { name: string }>("/hello", { json: { name: 1 } });

// Problem Details responses have a typed error body.
const problem: TestProblemResponse = await app.http.get<ProblemDetails>("/missing");
const code: string = (await problem.json()).code;
const problemStatus: number = (await problem.json()).status;
void [code, problemStatus];

// A real listener returns the same typed request.
const listener = await app.http.listen();
const listened = await listener.request<Greeting>("/hello");
const listenedMessage: string = (await listened.json()).message;
void listenedMessage;
