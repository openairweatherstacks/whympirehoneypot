import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  output: "standalone",
  outputFileTracingRoot: process.cwd(),
  serverExternalPackages: ["better-sqlite3", "pdf-parse", "tesseract.js"]
};

export default nextConfig;
