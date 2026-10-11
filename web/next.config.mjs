/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  transpilePackages: ["media-chrome"],
  turbopack: {
    root: process.cwd(),
  },
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 2592000, // 30 days
    deviceSizes: [360, 414, 640, 750, 828, 1080, 1200, 1920],
    imageSizes: [64, 96, 128, 160, 200, 256, 384],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.aoneroom.com",
      },
      {
        protocol: "https",
        hostname: "pbcdnw.aoneroom.com",
      },
      {
        protocol: "https",
        hostname: "**.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "**",
      },
      {
        protocol: "http",
        hostname: "**",
      },
    ],
  },
  async rewrites() {
    const backend = (
      process.env.INTERNAL_API_BASE ||
      process.env.NEXT_PUBLIC_API_BASE ||
      "http://127.0.0.1:8787"
    ).replace(/\/+$/, "");

    return [
      {
        source: "/api/auth/:path*",
        destination: `${backend}/api/auth/:path*`,
      },
      {
        source: "/api/sync/:path*",
        destination: `${backend}/api/sync/:path*`,
      },
      {
        source: "/api/history/:path*",
        destination: `${backend}/api/history/:path*`,
      },
      {
        source: "/api/playback/:path*",
        destination: `${backend}/api/playback/:path*`,
      },
      {
        source: "/api/household/:path*",
        destination: `${backend}/api/household/:path*`,
      },
      {
        source: "/api/access/:path*",
        destination: `${backend}/api/access/:path*`,
      },
      {
        source: "/api/music/:path*",
        destination: `${backend}/api/music/:path*`,
      },
      {
        source: "/search/suggest",
        destination: `${backend}/search/suggest`,
      },
    ];
  },
};

export default nextConfig;

