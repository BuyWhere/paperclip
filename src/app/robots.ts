import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/dashboard/',
          '/settings/',
          '/onboarding/',
          '/payment/',
          '/teams/',
          '/developers/dashboard/',
        ],
      },
    ],
    sitemap: 'https://8os.ai/sitemap.xml',
  }
}
