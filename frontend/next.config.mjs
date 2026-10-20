import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // 允许 e2e / CI 使用独立产物目录，避免与本地 `pnpm dev` 争用 `.next`
  distDir: process.env.NEXT_DIST_DIR || ".next",
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@react-native-async-storage/async-storage$": path.resolve(
        __dirname,
        "src/lib/stubs/asyncStorage.js"
      ),
      "react-native$": path.resolve(__dirname, "src/lib/stubs/reactNative.js"),
    };
    return config;
  },
};

export default nextConfig;
