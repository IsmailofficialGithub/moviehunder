import { getSiteUrl } from "../lib/config";

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
          "/login",
          "/signup",
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
