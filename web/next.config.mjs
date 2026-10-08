/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  transpilePackages: ["media-chrome"],
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
