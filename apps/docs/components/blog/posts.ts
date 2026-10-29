/** Shapes blog content entries into posts and decides which sections the index shows. */

/** Categories a post may declare; `blume.config.ts` validates frontmatter against these keys. */
export const blogCategories = {
  release: { label: "Release", tab: "Releases" },
  engineering: { label: "Engineering", tab: "Engineering" },
  guide: { label: "Guide", tab: "Guides" },
  company: { label: "Company", tab: "Company" },
} as const;

export type BlogCategory = keyof typeof blogCategories;

/** Line illustrations a post may name; each category falls back to one of them. */
export const blogIllustrations = ["trace", "timeline", "graph", "rings", "bars", "loop"] as const;

export type BlogIllustration = (typeof blogIllustrations)[number];

const categoryIllustration: Record<BlogCategory, BlogIllustration> = {
  release: "trace",
  engineering: "bars",
  guide: "timeline",
  company: "graph",
};

export interface BlogAuthor {
  readonly name: string;
  readonly avatar?: string;
  readonly url?: string;
}

export interface BlogPost {
  readonly entryId: string;
  readonly href: string;
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly date: Date;
  readonly category: BlogCategory;
  readonly illustration: BlogIllustration;
  readonly authors: readonly BlogAuthor[];
  readonly minutes: number;
  readonly featured: boolean;
}

/** The subset of an Astro `docs` collection entry this module reads. */
export interface BlogEntry {
  readonly id: string;
  readonly body?: string;
  readonly data: Readonly<Record<string, unknown>> & {
    readonly title: string;
    readonly description?: string;
    readonly type?: string;
  };
}

const wordsPerMinute = 220;

const isCategory = (value: unknown): value is BlogCategory =>
  typeof value === "string" && Object.hasOwn(blogCategories, value);

const isIllustration = (value: unknown): value is BlogIllustration =>
  typeof value === "string" && (blogIllustrations as readonly string[]).includes(value);

const toAuthor = (value: unknown): BlogAuthor | undefined => {
  if (typeof value === "string") return { name: value };
  if (value && typeof value === "object" && "name" in value && typeof value.name === "string") {
    const { avatar, url } = value as Record<string, unknown>;
    return {
      name: value.name,
      ...(typeof avatar === "string" ? { avatar } : {}),
      ...(typeof url === "string" ? { url } : {}),
    };
  }
  return undefined;
};

const toAuthors = (value: unknown): readonly BlogAuthor[] => {
  const authors = (Array.isArray(value) ? value : [value]).flatMap((item) => toAuthor(item) ?? []);
  return authors.length > 0 ? authors : [{ name: "RELKIT Team" }];
};

/** Counts prose words, skipping fenced code and MDX/HTML tags so reading time stays honest. */
const readingMinutes = (body: string) => {
  const prose = body.replace(/```[\s\S]*?```/g, " ").replace(/<[^>]+>/g, " ");
  const words = prose.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / wordsPerMinute));
};

/**
 * Builds newest-first posts from the docs collection, keeping only routable `type: blog` entries.
 * @param entries - Astro `docs` collection entries.
 * @param routeByEntry - Default-locale route path for each published entry id.
 * @returns Posts sorted by date, newest first.
 */
export function toPosts(
  entries: readonly BlogEntry[],
  routeByEntry: ReadonlyMap<string, string>,
): BlogPost[] {
  return entries
    .flatMap((entry): BlogPost[] => {
      const href = routeByEntry.get(entry.id);
      if (entry.data.type !== "blog" || href === undefined) return [];
      const category = isCategory(entry.data.category) ? entry.data.category : "company";
      return [
        {
          entryId: entry.id,
          href,
          slug: href.replace(/^\/blog\//, "").replace(/\/$/, ""),
          title: entry.data.title,
          description: entry.data.description ?? "",
          date: new Date(String(entry.data.date)),
          category,
          illustration: isIllustration(entry.data.illustration)
            ? entry.data.illustration
            : categoryIllustration[category],
          authors: toAuthors(entry.data.authors),
          minutes: readingMinutes(entry.body ?? ""),
          featured: entry.data.featured === true,
        },
      ];
    })
    .sort((a, b) => b.date.getTime() - a.date.getTime());
}

export interface BlogIndexLayout {
  /** `empty`: no posts; `single`: one post as a hero; `featured`: featured + latest (+ earlier). */
  readonly kind: "empty" | "single" | "featured";
  readonly featured?: BlogPost;
  readonly latest: readonly BlogPost[];
  readonly earlier: readonly BlogPost[];
  /** Posts marked `featured: true` beyond the one shown, so the build can flag stale flags. */
  readonly ignoredFeatured: readonly BlogPost[];
}

const latestCount = 3;

/**
 * Splits posts into index sections so no post is listed twice and no section renders empty.
 * The newest post marked `featured` leads; without one, the newest post does.
 * @param posts - Newest-first posts.
 * @returns The sections to render.
 */
export function layoutIndex(posts: readonly BlogPost[]): BlogIndexLayout {
  const marked = posts.filter((post) => post.featured);
  const featured = marked[0] ?? posts[0];
  const ignoredFeatured = marked.slice(1);
  if (featured === undefined) return { kind: "empty", latest: [], earlier: [], ignoredFeatured };
  if (posts.length === 1)
    return { kind: "single", featured, latest: [], earlier: [], ignoredFeatured };
  const rest = posts.filter((post) => post !== featured);
  return {
    kind: "featured",
    featured,
    latest: rest.slice(0, latestCount),
    earlier: rest.slice(latestCount),
    ignoredFeatured,
  };
}

/**
 * Lists category tabs in declaration order, only for categories that have posts.
 * @param posts - All posts.
 * @returns Tabs, or none when every post shares one category.
 */
export function categoryTabs(posts: readonly BlogPost[]) {
  const used = new Set(posts.map((post) => post.category));
  const tabs = (Object.keys(blogCategories) as BlogCategory[])
    .filter((category) => used.has(category))
    .map((category) => ({ category, label: blogCategories[category].tab }));
  return tabs.length >= 2 ? tabs : [];
}

/**
 * Picks related posts, same category first, then newest.
 * @param post - The post being read.
 * @param posts - All newest-first posts.
 * @param count - How many to return.
 * @returns Up to `count` other posts.
 */
export function relatedPosts(post: BlogPost, posts: readonly BlogPost[], count = 3): BlogPost[] {
  const others = posts.filter((other) => other !== post);
  return [
    ...others.filter((other) => other.category === post.category),
    ...others.filter((other) => other.category !== post.category),
  ].slice(0, count);
}

/** Blog feed path; Blume publishes it only once at least one post exists. */
export const blogFeed = "/blog/rss.xml";

/** Formats a post date in UTC so builds in any timezone print the same day. */
export const formatDate = (date: Date, month: "short" | "long" = "short") =>
  date.toLocaleDateString("en-US", { month, day: "numeric", year: "numeric", timeZone: "UTC" });

/** Initials for an author without an avatar. */
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
