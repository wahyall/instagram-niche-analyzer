import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Exclude playwright and worker-related modules from the client bundle
  // These are only needed for the worker process running on Railway/Render
  serverExternalPackages: ["playwright", "bullmq", "ioredis"],

  // Optimize for production
  poweredByHeader: false,

  // Configure for Vercel
  output: "standalone",
};

export default nextConfig;
