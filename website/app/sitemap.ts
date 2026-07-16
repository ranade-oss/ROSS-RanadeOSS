import type { MetadataRoute } from "next";
import { publicPages } from "./page-content";
import { siteConfig } from "./site-config";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", ...Object.keys(publicPages)].map((path) => ({
    url: `${siteConfig.websiteUrl}/${path}`,
    lastModified: new Date("2026-07-15"),
    changeFrequency: path === "updates" || path === "coverage" ? "weekly" : "monthly",
    priority: path === "" ? 1 : 0.7,
  }));
}
