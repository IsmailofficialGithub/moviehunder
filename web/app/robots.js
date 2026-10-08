import { getSiteUrl } from "../lib/config.js";

export default function robots() {
  const siteUrl = getSiteUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/settings/",
          "/profiles/",
          "/history/",
          "/auth/",
          "/play",
          "/search",
        ],
      },
      {
        userAgent: ["Googlebot", "Googlebot-Image", "Bingbot", "Applebot"],
        allow: "/",
        disallow: [
          "/api/",
          "/settings/",
          "/profiles/",
          "/history/",
          "/auth/",
          "/play",
          "/search",
        ],
      },
    ],
    sitemap: [
      `${siteUrl}/sitemap.xml`,
    ],
    host: siteUrl,
  };
}
