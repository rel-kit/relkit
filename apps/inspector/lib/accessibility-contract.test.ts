import { describe, expect, test } from "bun:test";

const source = async (path: string): Promise<string> =>
  Bun.file(`${import.meta.dir}/../app/${path}`).text();

describe("inspector accessibility contract", () => {
  test("critical forms expose names, descriptions, errors, and live status", async () => {
    const [route, field, invocation, filters] = await Promise.all([
      source("routes/route-composer.tsx"),
      source("routes/route-field.tsx"),
      source("functions/function-invocation.tsx"),
      source("signals-filters.tsx"),
    ]);

    expect(route).toContain('aria-labelledby="composer-heading"');
    expect(route).toContain('aria-describedby="composer-description"');
    expect(field).toContain("aria-describedby={describedBy}");
    expect(field).toContain("aria-invalid={error !== undefined}");
    expect(field).toContain("aria-errormessage");
    expect(route).toContain('role="status"');
    expect(route).toContain("Send request");
    expect(invocation).toContain('aria-labelledby="function-invocation-heading"');
    expect(invocation).toContain('id="function-input-help"');
    expect(invocation).toContain('role="alert"');
    expect(invocation).toContain("resultHeadingRef");
    expect(invocation).toContain("Invoke locally");
    expect(filters).toContain('aria-describedby="signal-filter-description"');
    expect(filters).toContain('id="signal-filter-severity"');
    expect(filters).toContain("Apply filters");
    expect(filters).toContain("Reset");
  });

  test("critical actions use semantic groups and an accessible modal confirmation", async () => {
    const [dialog, jobs, tools, layout, shell] = await Promise.all([
      source("confirmation-dialog.tsx"),
      source("jobs/job-actions.tsx"),
      source("tool-approval-actions.tsx"),
      source("layout.tsx"),
      source("inspector-shell.tsx"),
    ]);

    expect(dialog).toContain("<dialog");
    expect(dialog).toContain('aria-modal="true"');
    expect(dialog).toContain("onCancel");
    expect(dialog).toContain("Cancel");
    expect(jobs).toContain('role="group"');
    expect(jobs).toContain("Retry dead letter");
    expect(jobs).toContain("ConfirmationDialog");
    expect(jobs).not.toContain("window.confirm");
    expect(tools).toContain('role="group"');
    expect(tools).toContain("Approve");
    expect(tools).toContain("Deny");
    expect(tools).not.toContain("window.confirm");
    expect(layout + shell).toContain('href="#main-content"');
    expect(layout + shell).toContain("tabIndex={-1}");
  });

  test("the API reference opens Scalar directly in a new tab", async () => {
    const [page, navigation] = await Promise.all([
      source("api-reference/page.tsx"),
      source("navigation-data.ts"),
    ]);

    expect(page).toContain("SCALAR_API_REFERENCE_URL");
    expect(page).toContain('target="_blank"');
    expect(page).not.toContain("<iframe");
    expect(navigation).toContain("SCALAR_API_REFERENCE_URL");
    expect(navigation).toContain("external: true");
  });

  test("provider and runtime topology panels expose accessible headings", async () => {
    const [provider, runtime, cohort] = await Promise.all([
      source("provider-detail.tsx"),
      source("runtime-status.tsx"),
      source("activation-cohort.tsx"),
    ]);

    expect(provider).toContain('aria-labelledby="provider-topology-heading"');
    expect(provider).toContain('aria-labelledby="provider-local-heading"');
    expect(runtime).toContain('aria-labelledby="local-services-heading"');
    expect(runtime).toContain('aria-labelledby="telemetry-export-heading"');
    expect(cohort).toContain('aria-labelledby="activation-cohort-heading"');
    expect(cohort).toContain('role="alert"');
  });
});
