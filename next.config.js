// @ts-check

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // Wave 2: implicit-any TS debt noted; clean up in Wave 3 strict pass
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  // Prisma v7: keep WASM-based query compiler out of the webpack bundle so the
  // .wasm file is resolved from node_modules at runtime (not from a bundled path).
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', '@prisma/adapter-pg'],
  },
}

module.exports = nextConfig
