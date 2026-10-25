# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: landing.spec.ts >> navigation between docs and the landing preserves hydration and styling
- Location: browser/landing.spec.ts:79:1

# Error details

```
Error: expect(page).toHaveURL(expected) failed

Expected: "http://127.0.0.1:3002/"
Received: "http://127.0.0.1:3001/"
Timeout:  5000ms

Call log:
  - Expect "toHaveURL" with timeout 5000ms
    - waiting for navigation to finish...
    - navigated to "http://127.0.0.1:3001/"
    13 × locator resolved to <html lang="en" class="dark" data-astro-cid-5yyv5j6q="">…</html>
       - unexpected value "http://127.0.0.1:3001/"

```

```yaml
- main:
  - link "Relkit home":
    - /url: /
    - text: RELKIT
  - navigation "Main navigation":
    - link "Documentation":
      - /url: /docs
    - link "GitHub":
      - /url: https://github.com/rel-kit/relkit
    - link "Start building":
      - /url: /docs/learn/create-an-app
  - region "The TypeScript Kit Framework":
    - paragraph: THE TYPESCRIPT APPLICATION KIT
    - heading "The TypeScript Kit Framework" [level=1]
    - paragraph: Everything you need to build reliable, robust, scalable, observable TypeScript applications for agents and engineers.
    - link "Start building":
      - /url: /docs/learn/create-an-app
    - link "Read the docs":
      - /url: /docs
  - tablist "Relkit capabilities":
    - tab "Routes" [selected]
    - tab "Agent"
    - tab "Graph"
    - tab "Auth"
    - tab "Realtime"
    - tab "Streaming"
    - tab "Function"
    - tab "Service"
    - tab "Event"
    - tab "Cache"
    - tab "Bucket"
    - tab "Database"
    - tab "Jobs"
    - tab "Observability"
  - button "Next tabs"
  - tabpanel "Routes":
    - figure:
      - strong: Backend
      - link "src/routes/orders/[orderId]/route.ts":
        - /url: /docs/modules/http/routes
      - region "Backend example":
        - code: "import getOrder from \"get-order.function.js\"; import rateLimits from \"rate-limits.cache.js\"; // Read one order through its public service function. export const GET = defineRoute({ target: getOrder, client: { operation: \"query\" }, timeoutMs: 5_000, // Limit each customer to 20 reads per minute. rateLimit: { limit: 20, windowMs: 60_000, key: http.header(\"x-customer-email\"), store: rateLimits, }, });"
    - figure:
      - strong: Frontend
      - link "web/components/order-details.tsx":
        - /url: /docs/modules/http/routes
      - region "Frontend example":
        - code: "\"use client\"; export function OrderDetails() { const order = useRoute(\"GET /orders/:orderId\", { input: { orderId: \"order-1\" }, staleTime: 30_000, }); return ( <p> Order {order.data?.orderId}: {order.data?.status} </p> ); }"
  - region "Application capabilities":
    - paragraph: 01 / The building blocks
    - heading "Five parts. One application." [level=2]
    - paragraph: From a focused service to a complete execution path. The pieces fit together.
    - link "01 Service Organize functions and resources behind a focused domain boundary. Explore service":
      - /url: /docs/service
      - text: "01"
      - heading "Service" [level=3]
      - paragraph: Organize functions and resources behind a focused domain boundary.
      - text: Explore service
    - link "02 Routes Expose service functions through explicit, validated HTTP mappings. Explore routes":
      - /url: /docs/http
      - text: "02"
      - heading "Routes" [level=3]
      - paragraph: Expose service functions through explicit, validated HTTP mappings.
      - text: Explore routes
    - link "03 Functions Write transport-independent business logic with checked input and output. Explore functions":
      - /url: /docs/fundamentals/functions
      - text: "03"
      - heading "Functions" [level=3]
      - paragraph: Write transport-independent business logic with checked input and output.
      - text: Explore functions
    - link "04 Events Publish typed facts and process them with independent functions. Explore events":
      - /url: /docs/events
      - text: "04"
      - heading "Events" [level=3]
      - paragraph: Publish typed facts and process them with independent functions.
      - text: Explore events
    - link "05 Observability Correlate requests, logs, spans, events, and failures in one timeline. Explore observability":
      - /url: /docs/operations/observability
      - text: "05"
      - heading "Observability" [level=3]
      - paragraph: Correlate requests, logs, spans, events, and failures in one timeline.
      - text: Explore observability
  - region "One application model":
    - paragraph: 02 / One source of truth
    - heading "Your code is the blueprint." [level=2]
    - paragraph: Describe your application in TypeScript. Relkit checks the graph that connects your services, routes, resources, and async work.
    - paragraph: Development, tests, inspection, and deployment all start from that same model.
    - link "Explore the application model":
      - /url: /docs/modules/service/organization
    - text: One graph. Every connection.
    - term: Checked application graph
    - definition: "1"
    - term: "Templates: minimal, API, agent"
    - definition: "3"
    - term: Cloud credentials to start locally
    - definition: "0"
  - region "Local to cloud":
    - paragraph: 03 / Local to cloud
    - heading "Change the environment. Keep the model." [level=2]
    - paragraph: Local recipes, connected services, and infrastructure-owned resources share one checked topology, with explicit lifecycle ownership.
    - article:
      - paragraph: Develop locally
      - heading "Only the services you need." [level=3]
      - paragraph: Start pinned Redis and MinIO recipes for graph-required bindings. Keep local state scoped to your project.
      - link "Explore local development":
        - /url: /docs/learn/local-development
    - article:
      - paragraph: Connect and deploy
      - heading "Explicit resources. Less branching." [level=3]
      - paragraph: Combine connected services with infrastructure-owned AWS resources without maintaining parallel environment branches.
      - link "Explore integrations":
        - /url: /docs/modules/integrations
    - button "Pause connections animation"
  - paragraph: 04 / Observe and inspect
  - heading "See how it all connects." [level=2]
  - paragraph: Follow requests, functions, events, and async work through the local Inspector. The same graph identity connects the whole execution.
  - link "Explore the Relkit Inspector guide":
    - /url: /docs/modules/operations/inspector
    - text: localhost:3210 Relkit Inspector
    - img "Relkit Inspector with its navigation sidebar and routes workspace"
  - paragraph: Local evidence. Redacted before persistence.
  - article:
    - paragraph: 01 / Requests
    - heading "Follow every request" [level=3]
    - paragraph: Inspect the route, target function, response status, duration, and graph identity together.
    - link "Inspect requests":
      - /url: /docs/operations/inspector
  - article:
    - paragraph: 02 / Logs
    - heading "Correlate structured logs" [level=3]
    - paragraph: Keep complete bounded local logs before minimum-level filtering sends records to exporters.
    - link "Explore logs":
      - /url: /docs/operations/observability
  - article:
    - paragraph: 03 / Traces
    - heading "Trace async work" [level=3]
    - paragraph: Follow complete local spans even when root-consistent sampling omits a remote trace.
    - link "Explore traces":
      - /url: /docs/operations/observability
  - region "Open source ecosystem":
    - paragraph: 05 / Built in the open
    - heading "Familiar tools. A shared foundation." [level=2]
    - paragraph: Explore the source, run the examples, or help shape what comes next.
    - link "View Relkit on GitHub":
      - /url: https://github.com/rel-kit/relkit
    - list "Relkit technology stack":
      - listitem:
        - img "Bun"
        - text: Bun
      - listitem:
        - img "TypeScript"
        - text: TypeScript
      - listitem:
        - img "Effect"
        - text: Effect
      - listitem:
        - img "Hono"
        - text: Hono
      - listitem:
        - img "oRPC"
        - text: oRPC
      - listitem:
        - img "Pulumi"
        - text: Pulumi
      - listitem:
        - img "Cloudflare"
        - text: Cloudflare
      - listitem:
        - img "AWS"
        - text: AWS
      - listitem:
        - img "Railway"
        - text: Railway
    - button "Pause technology animation"
  - region "Read the guides":
    - paragraph: 06 / Find your starting point
    - heading "A little reading. A lot of building." [level=2]
    - link "01 / Get started Your first Relkit app Create, change, verify, and run an application. Open guide":
      - /url: /docs/learn/create-an-app
      - paragraph: 01 / Get started
      - heading "Your first Relkit app" [level=3]
      - paragraph: Create, change, verify, and run an application.
      - text: Open guide
    - link "02 / HTTP contracts From function to endpoint Connect validated functions to routes and OpenAPI. Open guide":
      - /url: /docs/modules/http/routes
      - paragraph: 02 / HTTP contracts
      - heading "From function to endpoint" [level=3]
      - paragraph: Connect validated functions to routes and OpenAPI.
      - text: Open guide
    - link "03 / Operations Follow the execution Test failure paths and trace a request end to end. Open guide":
      - /url: /docs/modules/operations/testing
      - paragraph: 03 / Operations
      - heading "Follow the execution" [level=3]
      - paragraph: Test failure paths and trace a request end to end.
      - text: Open guide
  - paragraph: Your next application starts here
  - heading "Make the pieces work together." [level=2]
  - paragraph: One TypeScript application. From the first local run.
  - link "Start building":
    - /url: /docs/learn/create-an-app
  - code: bunx create-relkit@latest
  - link "Relkit home":
    - /url: /
    - text: RELKIT
  - paragraph: The TypeScript application kit.
  - navigation "Footer navigation":
    - link "Docs":
      - /url: /docs
    - link "CLI":
      - /url: /docs/api/cli
    - link "API":
      - /url: /docs/api/app
    - link "GitHub":
      - /url: https://github.com/rel-kit/relkit
  - text: Built in the open. Built with TypeScript.
  - link "Back to top ↑":
    - /url: "#"
```

# Test source

```ts
  1  | /** Keeps the preserved React landing interactive inside the Astro document. */
  2  | import { expect, test } from "@playwright/test";
  3  | 
  4  | test("landing retains keyboard tabs, persisted pause and global search", async ({ page }) => {
  5  |   const errors: string[] = [];
  6  |   page.on("pageerror", (error) => errors.push(error.message));
  7  |   await page.goto("/", { waitUntil: "networkidle" });
  8  |   await page.getByRole("tab", { name: "Routes", exact: true }).focus();
  9  |   await page.keyboard.press("ArrowRight");
  10 |   await expect(page.getByRole("tab", { name: "Agent", exact: true })).toHaveAttribute(
  11 |     "aria-selected",
  12 |     "true",
  13 |   );
  14 |   await page.getByRole("button", { name: "Pause connections animation" }).click();
  15 |   await expect(page.getByRole("button", { name: "Play connections animation" })).toHaveAttribute(
  16 |     "aria-pressed",
  17 |     "true",
  18 |   );
  19 |   await page.reload({ waitUntil: "networkidle" });
  20 |   await expect(page.getByRole("button", { name: "Play connections animation" })).toHaveAttribute(
  21 |     "aria-pressed",
  22 |     "true",
  23 |   );
  24 |   await page.keyboard.press("ControlOrMeta+k");
  25 |   await page.getByRole("combobox").fill("upload file");
  26 |   await expect(
  27 |     page
  28 |       .locator('[data-blume-search-results] a[href="/guides/storage/upload-product-images"]')
  29 |       .first(),
  30 |   ).toContainText("Guides");
  31 |   await page.keyboard.press("Escape");
  32 |   expect(errors).toEqual([]);
  33 | });
  34 | 
  35 | test("mobile landing respects reduced motion and keeps example tabs usable", async ({ page }) => {
  36 |   await page.setViewportSize({ width: 390, height: 844 });
  37 |   await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
  38 |   await page.goto("/", { waitUntil: "networkidle" });
  39 |   await page.getByRole("tab", { name: "Routes", exact: true }).scrollIntoViewIfNeeded();
  40 |   await page.getByRole("button", { name: "Next tabs", exact: true }).click();
  41 |   await expect(page.getByRole("button", { name: "Previous tabs", exact: true })).toBeVisible();
  42 |   expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  43 |   expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(
  44 |     true,
  45 |   );
  46 | });
  47 | 
  48 | test("landing and docs retain canonical and social metadata", async ({ page, request }) => {
  49 |   for (const path of [
  50 |     "/",
  51 |     "/docs/learn/create-an-app",
  52 |     "/docs/modules/storage",
  53 |     "/guides/storage/upload-product-images",
  54 |     "/docs/api/buckets",
  55 |   ]) {
  56 |     await page.goto(path);
  57 |     const title = await page.title();
  58 |     const description = await page.locator('meta[name="description"]').getAttribute("content");
  59 |     expect(description?.length).toBeGreaterThan(20);
  60 |     await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", title);
  61 |     await expect(page.locator('meta[property="og:description"]')).toHaveAttribute(
  62 |       "content",
  63 |       description!,
  64 |     );
  65 |     await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
  66 |       "href",
  67 |       `https://relkit.up.railway.app${path}`,
  68 |     );
  69 |     const image = await page.locator('meta[property="og:image"]').getAttribute("content");
  70 |     expect(image).toBeTruthy();
  71 |     expect((await request.get(new URL(image!).pathname)).ok()).toBe(true);
  72 |     await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
  73 |       "content",
  74 |       "summary_large_image",
  75 |     );
  76 |   }
  77 | });
  78 | 
  79 | test("navigation between docs and the landing preserves hydration and styling", async ({
  80 |   page,
  81 | }) => {
  82 |   const errors: string[] = [];
  83 |   page.on("pageerror", (error) => errors.push(error.message));
  84 |   await page.goto("/docs/modules/storage");
  85 |   await page.getByRole("banner").getByRole("link", { name: "RELKIT", exact: true }).click();
> 86 |   await expect(page).toHaveURL("http://127.0.0.1:3002/");
     |                      ^ Error: expect(page).toHaveURL(expected) failed
  87 |   await expect(page.getByRole("tab", { name: "Routes", exact: true })).toBeVisible();
  88 |   await expect(page.locator("h1")).toHaveCount(1);
  89 |   expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  90 |   await page.locator('header a[href="/docs"]').first().click();
  91 |   await expect(page).toHaveURL("http://127.0.0.1:3002/docs");
  92 |   await expect(
  93 |     page.getByRole("heading", { name: "RELKIT documentation", exact: true }),
  94 |   ).toBeVisible();
  95 |   expect(errors).toEqual([]);
  96 | });
  97 | 
```