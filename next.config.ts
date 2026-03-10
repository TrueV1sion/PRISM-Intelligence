import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  serverExternalPackages: ["@modelcontextprotocol/sdk"],
};

export default nextConfig;
