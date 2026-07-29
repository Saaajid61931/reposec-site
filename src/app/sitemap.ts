import type { MetadataRoute } from "next";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = "https://reposec.site";
  const staticPages = [
    ["", 1, "weekly"],
    ["/pricing", 0.9, "monthly"],
    ["/sample-report", 0.8, "monthly"],
    ["/security", 0.7, "monthly"],
    ["/privacy", 0.4, "yearly"],
    ["/terms", 0.4, "yearly"],
    ["/acceptable-use", 0.4, "yearly"],
    ["/contact", 0.4, "yearly"],
  ] as const;

  const entries: MetadataRoute.Sitemap = staticPages.map(([path, priority, changeFrequency]) => ({
    url: `${base}${path}`,
    lastModified: new Date("2026-07-24"),
    changeFrequency,
    priority,
  }));

  const supabase = await createServerSupabaseClient();
  if (supabase) {
    const { data } = await supabase
      .from("public_report_settings")
      .select("public_slug,updated_at")
      .eq("enabled", true);
    for (const report of data ?? []) {
      entries.push({
        url: `${base}/p/${report.public_slug as string}`,
        lastModified: new Date(report.updated_at as string),
        changeFrequency: "weekly",
        priority: 0.5,
      });
    }
  }

  return entries;
}
