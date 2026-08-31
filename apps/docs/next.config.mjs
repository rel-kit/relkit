import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      ["/docs/start/events", "/docs/events"],
      ["/docs/start/events/:path*", "/docs/events/:path*"],
      ["/docs/start/check-build-deploy", "/docs/start/local-development#verify-changes"],
      ["/docs/start/check", "/docs/start/local-development#verify-changes"],
      ["/docs/start/build", "/docs/operations/cli-reference#relkit-build"],
      ["/docs/start/production", "/docs/operations/cli-reference#relkit-start"],
      ["/docs/fundamentals/schemas-errors-context", "/docs/fundamentals/schemas"],
      ["/docs/http/uploads-middleware-rate-limits", "/docs/http/uploads"],
      ["/docs/http/responses-openapi-clients", "/docs/http/responses"],
      ["/docs/resources-ai/buckets", "/docs/storage"],
      ["/docs/resources-ai/buckets-cache", "/docs/storage"],
      ["/docs/resources-ai/cache", "/docs/caching"],
      ["/docs/resources-ai/tools-agents", "/docs/ai/tools"],
      ["/docs/resources-ai/tools", "/docs/ai/tools"],
      ["/docs/resources-ai/agents", "/docs/ai/agents"],
      ["/docs/resources-ai/approvals", "/docs/ai/approvals"],
    ].map(([source, destination]) => ({ source, destination, permanent: true }));
  },
};

export default withMDX(nextConfig);
