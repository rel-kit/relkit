const image =
  "triggerdotdev/trigger.dev:main@sha256:3563088912cf4b880602d99815ddd787274c4ce5fc77738adf1e5bad287fbd1e";

const child = Bun.spawn(["docker", "image", "inspect", image], {
  stdout: "pipe",
  stderr: "pipe",
});
const [exitCode, stdout, stderr] = await Promise.all([
  child.exited,
  new Response(child.stdout).text(),
  new Response(child.stderr).text(),
]);

console.log(
  JSON.stringify(
    {
      recordedAt: new Date().toISOString(),
      provider: "trigger",
      profile: "self-hosted-docker",
      status: "not-tested",
      image,
      imagePresent: exitCode === 0,
      imageInspect: exitCode === 0 && stdout.trim() !== "" ? "present" : "not-present",
      sdk: { package: "@trigger.dev/sdk", version: "4.5.16", installed: false },
      reason:
        "The available Trigger image uses the moving main tag; no release-pinned image, registration, or authentication configuration is available for a safe durable-task probe.",
      inspectError: exitCode === 0 ? undefined : stderr.trim(),
    },
    null,
    2,
  ),
);
