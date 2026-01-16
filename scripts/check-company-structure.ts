import 'dotenv/config'
import { scrapeLinkedInCompany } from '../src/lib/apify'

async function test() {
  const url = 'linkedin.com/company/highgate'
  console.log(`Testing: ${url}\n`)

  const result = await scrapeLinkedInCompany(url)

  if (result) {
    console.log('Top-level keys:', Object.keys(result))
    console.log('')

    // Check posts structure
    const posts = (result as any).posts
    if (posts) {
      console.log(`posts is array: ${Array.isArray(posts)}`)
      console.log(`posts length: ${posts.length}`)
      if (posts.length > 0) {
        console.log('First post keys:', Object.keys(posts[0]))
        console.log('First post text field:', posts[0].text?.substring(0, 100))
      }
    } else {
      console.log('NO posts field found')
      console.log('Full result structure:')
      console.log(JSON.stringify(result, null, 2).substring(0, 2000))
    }
  } else {
    console.log('Result is NULL')
  }
}

test().catch(console.error)
