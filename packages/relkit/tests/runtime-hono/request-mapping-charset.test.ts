/**
 * A JSON body is text in UTF-8: bytes that are not valid UTF-8 and a declared charset other than
 * UTF-8 are malformed bodies (422), never stored with U+FFFD replacement characters. A lone
 * surrogate written as a `\ud800` escape is legal JSON and stays.
 */
import { expect, test } from "vitest";
import { mapRequest } from "../../src/runtime-hono/request-mapping.js";

const mapping = { kind: "input", fields: { name: { kind: "body", name: "name" } } } as const;

/** Maps one POST carrying these bytes and this content type. */
function map(body: Uint8Array | string, contentType = "application/json") {
  const request = new Request("http://localhost/orders", {
    method: "POST",
    headers: { "content-type": contentType },
    body: body as BodyInit,
  });
  return mapRequest({ request, params: {}, query: {}, headers: {} }, mapping);
}

/** The bytes of `{"name":"<prefix><raw bytes>"}`. */
function withBytes(raw: readonly number[]): Uint8Array {
  const encoder = new TextEncoder();
  return new Uint8Array([...encoder.encode('{"name":"Caf'), ...raw, ...encoder.encode('"}')]);
}

test("a lone Latin-1 byte is not valid UTF-8", async () => {
  expect(await map(withBytes([0xe9]))).toEqual({
    ok: false,
    issues: [{ code: "malformed-json", message: "Request body is not valid UTF-8", path: [] }],
  });
});

test("a surrogate or an overlong sequence in the bytes is not valid UTF-8", async () => {
  for (const raw of [[0xed, 0xa0, 0x80], [0xc0, 0xaf], [0xff], [0xf4, 0x90, 0x80, 0x80]]) {
    expect(await map(withBytes(raw))).toMatchObject({
      ok: false,
      issues: [{ code: "malformed-json", message: "Request body is not valid UTF-8" }],
    });
  }
});

test("a declared charset other than UTF-8 is refused", async () => {
  for (const type of [
    "application/json; charset=iso-8859-1",
    'application/json; charset="windows-1252"',
    "application/json;charset=utf-16",
  ]) {
    expect(await map('{"name":"Cafe"}', type)).toEqual({
      ok: false,
      issues: [
        {
          code: "content-type",
          message: "Request content type must declare the charset UTF-8",
          path: [],
        },
      ],
    });
  }
});

test("valid UTF-8 is read as sent, with or without a UTF-8 charset", async () => {
  const bytes = new TextEncoder().encode('{"name":"Café 😀"}');
  for (const type of [
    "application/json",
    "application/json; charset=utf-8",
    "application/json; charset=UTF-8",
    'application/json; charset="utf-8"',
    "application/vnd.api+json; charset=utf8",
  ]) {
    expect(await map(bytes, type)).toEqual({ ok: true, value: { name: "Café 😀" } });
  }
});

test("a lone surrogate written as an escape is legal JSON and stays", async () => {
  const result = await map('{"name":"a\\ud800b"}');
  expect(result).toEqual({ ok: true, value: { name: "a\ud800b" } });
});
