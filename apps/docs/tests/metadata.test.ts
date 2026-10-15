import { expect, mock, test } from "bun:test";
import type { Metadata } from "next";
import { metadata } from "../app/layout";

// Next aliases this server-build marker; Bun tests run outside its bundler.
mock.module("server-only", () => ({}));
const { accumulateMetadata } = await import("next/dist/lib/metadata/resolve-metadata.js");

function resolvePageMetadata(pathname: string, page: Metadata = {}) {
  return accumulateMetadata(
    pathname,
    [
      [metadata, null],
      [null, null],
      [page, null],
    ],
    Promise.resolve(pathname),
    { isStaticMetadataRouteFile: false, trailingSlash: false },
  );
}

test("homepage social previews retain the default title, description, and shared image", async () => {
  const resolved = await resolvePageMetadata("/");
  expect(resolved.title?.absolute).toBe("Relkit — One application model for TypeScript backends");
  expect(resolved.openGraph?.title).toEqual(resolved.title);
  expect(resolved.twitter?.title).toEqual(resolved.title);
  expect(resolved.openGraph?.description).toBe(metadata.description);
  expect(resolved.twitter?.description).toBe(metadata.description);
  expect(resolved.openGraph?.images).toContainEqual(
    expect.objectContaining({ url: "https://relkit.up.railway.app/metadata/og.png" }),
  );
  expect(resolved.twitter).toMatchObject({ card: "summary_large_image" });
});

test.each([
  ["/docs/http/routes", "HTTP routes", "Map validated functions to HTTP routes."],
  ["/docs/operations/testing", "Testing", "Test failure paths and inspect executions."],
])(
  "%s uses the guide's title and description in social previews",
  async (pathname, title, description) => {
    const resolved = await resolvePageMetadata(pathname, { title, description });
    expect(resolved.title?.absolute).toBe(`${title} | Relkit`);
    expect(resolved.openGraph?.title).toEqual(resolved.title);
    expect(resolved.twitter?.title).toEqual(resolved.title);
    expect(resolved.openGraph?.description).toBe(description);
    expect(resolved.twitter?.description).toBe(description);
    expect(resolved.openGraph?.images).toContainEqual(
      expect.objectContaining({ url: "https://relkit.up.railway.app/metadata/og.png" }),
    );
    expect(resolved.twitter).toMatchObject({
      card: "summary_large_image",
      images: [{ url: "https://relkit.up.railway.app/metadata/og.png" }],
    });
  },
);
