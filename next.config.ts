import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // onnxruntime-web (used by the receipt scanner) ships a ~25.6 MB WASM
      // binary for the threaded/WebGPU backend. Webpack emits it as a static
      // asset, which breaks `opennextjs-cloudflare deploy`: Workers caps a
      // single asset at 25 MiB.
      //
      // It doesn't belong in the bundle anyway — `src/lib/ocr.ts` points
      // ort.env.wasm.wasmPaths at the CDN copy before initialising, so the
      // runtime fetches it from there. Resolve the URL but don't emit the file.
      config.module.rules.push({
        test: /\.wasm$/,
        type: "asset/resource",
        generator: { emit: false },
      });
    }
    return config;
  },
};

export default nextConfig;
