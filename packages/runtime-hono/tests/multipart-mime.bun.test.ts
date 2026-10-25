/** Runs on Bun because its native form parser guesses MIME types from filenames. */
import { expect, test } from "bun:test";
import { MISSING, parseForm } from "../src/request-mapping-body.js";

test("retains wire MIME types, duplicate fields and binary bytes", async () => {
  const form = new FormData();
  form.append("tag", "one");
  form.append("tag", "two");
  const bytes = new Uint8Array([0, 255, 13, 10, 42]);
  form.append("file", new File([bytes], "misleading.txt", { type: "text/html" }));
  const result = await parseForm({
    request: new Request("http://app/upload", { method: "POST", body: form }),
    maxBodyBytes: 6_000_000,
  });
  expect(result.issue).toBeUndefined();
  if (result.value === MISSING) throw new Error("Expected multipart values");
  expect(result.value.getAll("tag")).toEqual(["one", "two"]);
  const file = result.value.getAll("file")[0];
  expect(file).toBeInstanceOf(File);
  if (!(file instanceof File)) throw new Error("Expected uploaded file");
  expect(file.type.split(";")[0]).toBe("text/html");
  expect(new Uint8Array(await file.arrayBuffer())).toEqual(bytes);
});

test("rejects truncated multipart data and retains the configured body bound", async () => {
  for (const maxBodyBytes of [2, 1000]) {
    const result = await parseForm({
      request: new Request("http://app/upload", {
        method: "POST",
        headers: { "content-type": "multipart/form-data; boundary=test" },
        body: '--test\r\nContent-Disposition: form-data; name="file"\r\n\r\nunfinished',
      }),
      maxBodyBytes,
    });
    expect(result.value).toBe(MISSING);
    expect(result.issue?.code).toBe(maxBodyBytes === 2 ? "body-too-large" : "malformed-multipart");
  }
});
