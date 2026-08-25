/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["media-chrome"],
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
