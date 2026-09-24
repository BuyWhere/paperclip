import { blogPosts, getAllBlogPosts } from '../content/blog'

// OS-8023: the public blog index must never expose future/placeholder
// publish dates. Dates are static strings, so guard them here rather
// than at render time.
describe('blog post dates (OS-8023)', () => {
  it('has an isoDate matching the display date for every post', () => {
    for (const post of blogPosts) {
      const d = new Date(post.isoDate + 'T00:00:00Z')
      expect(Number.isNaN(d.getTime())).toBe(false)
      expect(d.toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
      })).toBe(post.date)
    }
  })

  it('contains no future-dated posts', () => {
    const now = Date.now()
    for (const post of blogPosts) {
      const d = new Date(post.isoDate + 'T00:00:00Z').getTime()
      expect(d).toBeLessThanOrEqual(now)
    }
  })

  it('sorts newest first', () => {
    const sorted = getAllBlogPosts()
    for (let i = 1; i < sorted.length; i++) {
      expect(new Date(sorted[i - 1].isoDate).getTime())
        .toBeGreaterThanOrEqual(new Date(sorted[i].isoDate).getTime())
    }
  })
})
