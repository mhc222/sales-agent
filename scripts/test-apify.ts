import 'dotenv/config'

async function testApify() {
  const apiKey = process.env.APIFY_API_KEY
  console.log('APIFY_API_KEY set:', Boolean(apiKey))
  console.log('Key prefix:', apiKey?.substring(0, 15) + '...')

  // Test API connectivity
  const response = await fetch(`https://api.apify.com/v2/users/me?token=${apiKey}`)
  console.log('Apify API status:', response.status)

  if (response.ok) {
    const data = await response.json()
    console.log('User:', (data as any).data?.username || 'unknown')
    console.log('Plan:', (data as any).data?.plan?.name || 'unknown')
  } else {
    console.log('Error:', await response.text())
  }

  // Test a simple scrape
  console.log('\n--- Testing LinkedIn Profile Scraper ---')
  const { scrapeLinkedInProfile } = await import('../src/lib/apify')

  // Use a known LinkedIn URL
  const testUrl = 'https://www.linkedin.com/in/lwaiser'
  console.log('Testing URL:', testUrl)

  const result = await scrapeLinkedInProfile(testUrl)
  console.log('Result:', result ? `Got data with ${(result as any).posts?.length || 0} posts` : 'NULL - no data returned')
}

testApify().catch(console.error)
