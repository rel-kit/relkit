import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  rewrites() {
    const backendUrl = process.env.ZSYS_BACKEND_URL?.replace(/\/$/, "");
    return backendUrl === undefined
      ? []
      : [{ source: "/_zsys/backend/:path*", destination: `${backendUrl}/:path*` }];
  },
};

export default nextConfig;
