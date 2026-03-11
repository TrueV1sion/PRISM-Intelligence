import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: false,
  serverExternalPackages: ["@modelcontextprotocol/sdk", "@anthropic-ai/sdk"],
};

export default nextConfig;
