# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: greeting.spec.ts >> name form updates via backend while preserving fullstack content and wrapper
- Location: tests/browser/greeting.spec.ts:5:0

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator: getByRole('alert')
Expected: "Greeting could not load. Try updating it again."
Error: strict mode violation: getByRole('alert') resolved to 2 elements:
    1) <p role="alert">Greeting could not load. Try updating it again.</p> aka getByText('Greeting could not load. Try')
    2) <div role="alert" aria-live="assertive" id="__next-route-announcer__"></div> aka locator('[id="__next-route-announcer__"]')

Call log:
  - Expect "toHaveText" getByRole('alert') with timeout 10000ms
  - waiting for getByRole('alert')
    - locator resolved to <div role="alert" aria-live="assertive" id="__next-route-announcer__"></div>
    - unexpected value ""

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - banner [ref=e2]:
    - link "Existing workspace" [ref=e3] [cursor=pointer]:
      - /url: /
  - main [ref=e4]:
    - heading "Loading greeting…" [level=1] [ref=e5]
    - region "Greeting" [ref=e6]:
      - generic [ref=e7]:
        - text: Name
        - textbox "Name" [ref=e8]: Grace
        - paragraph [ref=e9]: Use 1 to 80 characters. Spaces alone are invalid.
        - button "Update greeting" [ref=e10]
      - alert [ref=e11]: Greeting could not load. Try updating it again.
    - region [ref=e12]:
      - heading "Existing information" [level=2] [ref=e13]
      - paragraph [ref=e14]: This page belongs to the selected fullstack application.
  - contentinfo [ref=e15]: Existing fullstack wrapper
  - alert [ref=e16]
```

# Test source

```ts
  1  | import { expect, test } from "@playwright/test";
  2  | 
  3  | const apiOrigin = new URL(process.env.RELKIT_API_URL ?? "http://127.0.0.1:3000").origin;
  4  | 
  5  | test("name form updates via backend while preserving fullstack content and wrapper", async ({ page }) => {
  6  |   await page.goto("/");
  7  |   await expect(page.getByRole("link", { name: "Existing workspace" })).toBeVisible();
  8  |   await expect(page.getByText("Existing fullstack wrapper")).toBeVisible();
  9  |   await expect(page.getByRole("heading", { name: "Existing information" })).toBeVisible();
  10 |   await expect(page.getByRole("heading", { name: "Hello, Relkit!", exact: true })).toBeVisible();
  11 |   const name = page.getByLabel("Name", { exact: true });
  12 |   const submit = page.getByRole("button", { name: "Update greeting" });
  13 |   await name.fill("Ada");
  14 |   const backendResponse = page.waitForResponse(async (response) => {
  15 |     if (new URL(response.url()).origin !== apiOrigin || !response.ok()) return false;
  16 |     return (await response.text()).includes("Hello, Ada!");
  17 |   });
  18 |   await name.press("Enter");
  19 |   await backendResponse;
  20 |   await expect(page.getByRole("heading", { name: "Hello, Ada!", exact: true })).toBeVisible();
  21 |   await name.fill("   ");
  22 |   await expect(submit).toBeDisabled();
  23 |   await expect(page.getByRole("heading", { name: "Hello, Ada!", exact: true })).toBeVisible();
  24 |   await name.fill("Grace");
  25 |   await page.route(apiOrigin + "/**", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Test-owned unavailable backend" }) }));
  26 |   await submit.click();
> 27 |   await expect(page.getByRole("alert")).toHaveText("Greeting could not load. Try updating it again.");
     |                                        ^ Error: expect(locator).toHaveText(expected) failed
  28 |   await page.unroute(apiOrigin + "/**");
  29 |   await submit.click();
  30 |   await expect(page.getByRole("heading", { name: "Hello, Grace!", exact: true })).toBeVisible();
  31 |   await page.setViewportSize({ width: 375, height: 812 });
  32 |   await expect(name).toBeVisible();
  33 |   await expect(submit).toBeVisible();
  34 |   await expect(page.getByText("This page belongs to the selected fullstack application.")).toBeVisible();
  35 | });
  36 | 
```