import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  output: "standalone",
  outputFileTracingRoot: process.cwd(),
  serverExternalPackages: ["pdf-parse", "tesseract.js"]
};

export default nextConfig;
