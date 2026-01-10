import { inngest } from '../inngest/client'
import 'dotenv/config'

async function testIngest() {
  console.log('Sending test lead.ingested event to Inngest...\n')

  const testLead = {
    name: 'lead.ingested' as const,
    data: {
      first_name: 'Test',
      last_name: 'User',
      email: 'test.user@example.com',
      job_title: 'Marketing Director',
      headline: 'Marketing leader driving growth for B2B SaaS companies',
      department: 'Marketing',
      seniority_level: 'Director',
      years_experience: 8,
      linkedin_url: 'https://linkedin.com/in/testuser',
      company_name: 'Acme Corp',
      company_linkedin_url: 'https://linkedin.com/company/acme-corp',
      company_domain: 'acme.com',
      company_employee_count: 150,
      company_revenue: '$10M-$50M',
      company_industry: 'Software',
      company_description: 'B2B SaaS company providing marketing automation tools',
      intent_signal: {
        page_visited: 'https://jsbmedia.com/services',
        time_on_page: 120,
        event_type: 'page_view',
        timestamp: new Date().toISOString(),
      },
      tenant_id: process.env.TENANT_ID!,
    },
  }

  try {
    const result = await inngest.send(testLead)
    console.log('✅ Event sent successfully!')
    console.log('Event IDs:', result.ids)
    console.log('\nCheck the Inngest dashboard at http://localhost:8288 to see the workflow run.')
  } catch (error) {
    console.error('❌ Failed to send event:', error)
    process.exit(1)
  }
}

testIngest()
