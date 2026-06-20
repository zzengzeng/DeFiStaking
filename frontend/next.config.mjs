import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
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
