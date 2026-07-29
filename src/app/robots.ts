import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/pricing", "/sample-report", "/security", "/privacy", "/terms", "/acceptable-use", "/contact", "/p/"],
        disallow: ["/dashboard/", "/scan/", "/api/", "/auth/"],
      },
    ],
    sitemap: "https://reposec.site/sitemap.xml",
    host: "https://reposec.site",
  };
}
