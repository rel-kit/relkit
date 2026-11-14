import { describe, expect, test } from "bun:test";
import { providerHealth, provenance, releaseSourceSummary } from "./provider-provenance";

describe("where a provider binding comes from", () => {
  test("says a local-only binding has no release source", () => {
    expect(provenance("local-only")).toEqual({
      label: "local only",
      text: "Local only: no release source.",
      hasReleaseSource: false,
    });
  });

  test("says a connected or provisioned binding has one", () => {
    expect(provenance("connected")).toMatchObject({ label: "connected", hasReleaseSource: true });
    expect(provenance("infrastructure")).toMatchObject({
      label: "infrastructure",
      hasReleaseSource: true,
    });
  });

  test("reads an unknown kind as it was reported", () => {
    expect(provenance("hosted")).toMatchObject({ label: "hosted", hasReleaseSource: true });
    expect(provenance(undefined)).toMatchObject({ label: "not reported" });
  });

  test("summarises the list as provenance, never as health", () => {
    expect(releaseSourceSummary(["connected", "connected", "local-only"])).toBe(
      "2 of 3 have a release source",
    );
    expect(releaseSourceSummary([])).toBe("0 of 0 have a release source");
  });
});

describe("the health a provider binding reports", () => {
  const buckets = [
    { id: "assets", profile: "default", state: "ready" },
    { id: "archive", profile: "custom", state: "degraded" },
    { id: "broken", profile: "broken", state: "unavailable" },
  ];

  test("takes the reported state of the resources that use the binding's profile", () => {
    expect(providerHealth("bucket", "default", { bucket: buckets, cache: [] })).toBe("ready");
    expect(providerHealth("bucket", "custom", { bucket: buckets, cache: [] })).toBe("degraded");
    expect(providerHealth("bucket", "broken", { bucket: buckets, cache: [] })).toBe("unavailable");
  });

  test("the worst state among several resources wins", () => {
    const mixed = [
      { id: "a", profile: "default", state: "ready" },
      { id: "b", profile: "default", state: "unavailable" },
      { id: "c", profile: "default", state: "degraded" },
    ];
    expect(providerHealth("bucket", "default", { bucket: mixed, cache: [] })).toBe("unavailable");
  });

  test("a binding nothing reports on has no health", () => {
    expect(providerHealth("bucket", "missing", { bucket: buckets, cache: [] })).toBeUndefined();
    expect(providerHealth("database", "default", { bucket: buckets, cache: [] })).toBeUndefined();
    expect(providerHealth("cache", "default", { bucket: buckets, cache: [] })).toBeUndefined();
  });

  test("a state the API does not define is shown as reported", () => {
    expect(
      providerHealth("bucket", "p", {
        bucket: [{ id: "x", profile: "p", state: "failed" }],
        cache: [],
      }),
    ).toBe("failed");
  });
});
