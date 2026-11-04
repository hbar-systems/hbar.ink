import type { MetadataRoute } from 'next'

const routes = ['', '/about', '/legal', '/impressum']

export default function sitemap(): MetadataRoute.Sitemap {
  return routes.map((r) => ({ url: `https://hbar.ink${r}` }))
}
