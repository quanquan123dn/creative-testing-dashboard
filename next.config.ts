import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.fbcdn.net',
      },
      {
        protocol: 'https',
        hostname: '**.facebook.com',
      },
      {
        protocol: 'https',
        hostname: 'scontent.**.fna.fbcdn.net',
      },
    ],
  },
};

export default nextConfig;
