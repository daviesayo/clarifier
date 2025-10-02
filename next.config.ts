import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ensure proper output for Vercel
  output: 'standalone',
  // Enable compression
  compress: true,
  // Optimize images
  images: {
    unoptimized: false,
  },
  // Disable React strict mode in development to avoid double rendering issues
  reactStrictMode: false,
};

export default nextConfig;
