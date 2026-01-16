import 'dotenv/config'
import { scrapeLinkedInCompany } from '../src/lib/apify'

async function test() {
  // Test a few company URLs that failed
  const testUrls = [
    'linkedin.com/company/highgate',
    'linkedin.com/company/verabank',
    'linkedin.com/company/customer-impact',
  ]

  for (const url of testUrls) {
    console.log(`\n=== Testing: ${url} ===`)
    const result = await scrapeLinkedInCompany(url)

    if (result) {
      const posts = (result as any).posts || []
      console.log(`Result: ${posts.length} posts found`)
      if (posts.length > 0) {
        console.log(`First post: ${posts[0].text?.substring(0, 100)}...`)
      }
    } else {
      console.log('Result: NULL - no data')
    }
  }
}

test().catch(console.error)
