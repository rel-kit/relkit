import { describe, expect, test } from "bun:test";
import { contentTypeConflict, isPdfContent, objectFacts } from "./bucket-object";

describe("an object whose content type contradicts its key", () => {
  test("flags the audit's png stored as a Windows executable", () => {
    expect(contentTypeConflict("images/pic.png", "application/x-msdownload")).toEqual({
      extension: ".png",
      contentType: "application/x-msdownload",
    });
  });

  test("accepts the type the extension names, in any case and with parameters", () => {
    expect(contentTypeConflict("pic.png", "image/png")).toBeUndefined();
    expect(contentTypeConflict("pic.PNG", "Image/PNG")).toBeUndefined();
    expect(contentTypeConflict("data.json", "application/json; charset=utf-8")).toBeUndefined();
    expect(contentTypeConflict("photo.jpg", "image/jpeg")).toBeUndefined();
    expect(contentTypeConflict("app.js", "text/javascript")).toBeUndefined();
  });

  test("does not flag a generic binary type, an unknown extension or a missing value", () => {
    expect(contentTypeConflict("pic.png", "application/octet-stream")).toBeUndefined();
    expect(contentTypeConflict("file.unknownext", "image/png")).toBeUndefined();
    expect(contentTypeConflict("README", "text/plain")).toBeUndefined();
    expect(contentTypeConflict("pic.png", undefined)).toBeUndefined();
  });

  test("uses the last extension of the file name, not of the folders", () => {
    expect(contentTypeConflict("v1.2/archive.tar.gz", "application/gzip")).toBeUndefined();
    expect(contentTypeConflict("a.png/readme", "text/plain")).toBeUndefined();
  });
});

describe("what a listing says about an object", () => {
  test("reads size, content type and modified time from the listing", () => {
    expect(
      objectFacts({
        key: "pic.png",
        size: 1024,
        lastModified: "2026-11-01T10:00:00.000Z",
        metadata: { contentType: "image/png" },
      }),
    ).toEqual({ size: 1024, contentType: "image/png", lastModified: "2026-11-01T10:00:00.000Z" });
  });

  test("falls back to the size in the metadata and leaves out what is not reported", () => {
    expect(objectFacts({ key: "a", metadata: { size: 5 } })).toEqual({ size: 5 });
    expect(objectFacts({ key: "a" })).toEqual({});
  });
});

describe("whether PDF content is a PDF", () => {
  test("checks the signature of the decoded bytes", () => {
    expect(isPdfContent(btoa("%PDF-1.7\n..."))).toBe(true);
    expect(isPdfContent(btoa("not a pdf"))).toBe(false);
    expect(isPdfContent("%%%")).toBe(false);
    expect(isPdfContent("")).toBe(false);
  });
});
