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
};

export default nextConfig;
