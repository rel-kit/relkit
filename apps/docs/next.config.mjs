import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      ["/docs/start/check-build-deploy", "/docs/start/check"],
      ["/docs/fundamentals/schemas-errors-context", "/docs/fundamentals/schemas"],
      ["/docs/http/uploads-middleware-rate-limits", "/docs/http/uploads"],
      ["/docs/http/responses-openapi-clients", "/docs/http/responses"],
      ["/docs/resources-ai/buckets-cache", "/docs/resources-ai/buckets"],
      ["/docs/resources-ai/tools-agents", "/docs/resources-ai/tools"],
    ].map(([source, destination]) => ({ source, destination, permanent: true }));
  },
};

export default withMDX(nextConfig);
