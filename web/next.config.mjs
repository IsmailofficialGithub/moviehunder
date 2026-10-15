/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  transpilePackages: ["media-chrome"],
  turbopack: {
    root: process.cwd(),
  },
  images: {
    unoptimized: true,
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
        source: "/api/profiles/:path*",
        destination: `${backend}/api/profiles/:path*`,
      },
      {
        source: "/search/suggest",
        destination: `${backend}/search/suggest`,
      },
    ];
  },
};

export default nextConfig;

