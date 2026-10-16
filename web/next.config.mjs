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
        source: "/detail/:slug*",
        destination: "/title/:slug*",
      },
      {
        source: "/search/suggest",
        destination: `${backend}/search/suggest`,
      },
      {
        source: "/ranking/:path*",
        destination: `${backend}/ranking/:path*`,
      },
      {
        source: "/api/stream/:path*",
        destination: `${backend}/api/stream/:path*`,
      },
      {
        source: "/watch/:path*",
        destination: `${backend}/watch/:path*`,
      },
      {
        source: "/api/subtitles/:path*",
        destination: `${backend}/api/subtitles/:path*`,
      },
      {
        source: "/presence/:path*",
        destination: `${backend}/presence/:path*`,
      },
    ];
  },
};

export default nextConfig;

