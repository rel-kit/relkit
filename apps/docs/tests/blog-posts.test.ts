/** Covers how blog entries become posts and which index sections each post count renders. */
import { expect, test } from "bun:test";
import {
  categoryTabs,
  layoutIndex,
  relatedPosts,
  toPosts,
  type BlogEntry,
} from "../components/blog/posts.js";

const entry = (id: string, data: Record<string, unknown>, body = "word "): BlogEntry => ({
  id,
  body,
  data: { title: id, type: "blog", ...data },
});

const posts = (count: number, extra: (index: number) => Record<string, unknown> = () => ({})) => {
  const entries = Array.from({ length: count }, (_, index) =>
    entry(`blog/post-${index}.mdx`, {
      date: `2026-10-${String(10 + index).padStart(2, "0")}`,
      category: "release",
      ...extra(index),
    }),
  );
  return toPosts(entries, new Map(entries.map((item) => [item.id, `/${item.id.slice(0, -4)}`])));
};

test("keeps routable blog entries only, newest first, with defaults", () => {
  const entries = [
    entry("blog/old.mdx", { date: "2026-01-01" }, "word ".repeat(700)),
    entry("blog/new.mdx", { date: "2026-02-01", category: "guide", authors: ["Ada"] }),
    entry("blog/draft.mdx", { date: "2026-03-01" }),
    entry("docs/page.mdx", { date: "2026-04-01", type: undefined }),
  ];
  const result = toPosts(
    entries,
    new Map([
      ["blog/old.mdx", "/blog/old"],
      ["blog/new.mdx", "/blog/new"],
      ["docs/page.mdx", "/docs/page"],
    ]),
  );
  expect(result.map((post) => post.slug)).toEqual(["new", "old"]);
  expect(result[0]).toMatchObject({
    category: "guide",
    illustration: "timeline",
    authors: [{ name: "Ada" }],
  });
  expect(result[1]).toMatchObject({
    category: "company",
    authors: [{ name: "RELKIT Team" }],
    minutes: 3,
  });
});

test("reading time ignores fenced code", () => {
  const [post] = toPosts(
    [
      entry(
        "blog/code.mdx",
        { date: "2026-01-01" },
        `intro\n\`\`\`ts\n${"code ".repeat(2000)}\n\`\`\``,
      ),
    ],
    new Map([["blog/code.mdx", "/blog/code"]]),
  );
  expect(post?.minutes).toBe(1);
});

test("no posts render the empty state", () => {
  expect(layoutIndex([])).toMatchObject({ kind: "empty", latest: [], earlier: [] });
});

test("one post renders as a single hero", () => {
  const [only] = posts(1);
  expect(layoutIndex([only!])).toMatchObject({
    kind: "single",
    featured: only,
    latest: [],
    earlier: [],
  });
});

test("two to four posts fill featured and latest without an earlier grid", () => {
  for (const count of [2, 3, 4]) {
    const all = posts(count);
    const index = layoutIndex(all);
    expect(index.kind).toBe("featured");
    expect(index.latest).toHaveLength(count - 1);
    expect(index.earlier).toHaveLength(0);
  }
});

test("five or more posts list each post exactly once", () => {
  const all = posts(7);
  const index = layoutIndex(all);
  const listed = [index.featured, ...index.latest, ...index.earlier];
  expect(index.latest).toHaveLength(3);
  expect(index.earlier).toHaveLength(3);
  expect(new Set(listed).size).toBe(all.length);
});

test("the newest featured post leads and older featured flags are reported", () => {
  const all = posts(5, (index) => ({ featured: index === 1 || index === 3 }));
  const index = layoutIndex(all);
  expect(index.featured?.slug).toBe("post-3");
  expect(index.ignoredFeatured.map((post) => post.slug)).toEqual(["post-1"]);
  expect(index.latest[0]?.slug).toBe("post-4");
});

test("without a featured flag the newest post leads", () => {
  expect(layoutIndex(posts(3)).featured?.slug).toBe("post-2");
});

test("tabs appear only once posts span two categories", () => {
  expect(categoryTabs(posts(3))).toEqual([]);
  const mixed = posts(3, (index) => ({ category: index === 0 ? "guide" : "release" }));
  expect(categoryTabs(mixed).map((tab) => tab.label)).toEqual(["Releases", "Guides"]);
});

test("related posts prefer the same category", () => {
  const all = posts(4, (index) => ({ category: index % 2 === 0 ? "release" : "guide" }));
  const release = all.find((post) => post.category === "release")!;
  const related = relatedPosts(release, all);
  expect(related.map((post) => post.category)).toEqual(["release", "guide", "guide"]);
});
