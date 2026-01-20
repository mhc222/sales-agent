import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/src/lib/supabase-server'
import { inngest } from '@/inngest/client'
import type { ApolloLead } from '@/src/lib/apollo'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    // Verify user is authenticated
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's tenant
    const { data: userTenant } = await supabase
      .from('user_tenants')
      .select('tenant:tenants(id)')
      .eq('user_id', user.id)
      .single()

    if (!userTenant?.tenant) {
      return NextResponse.json({ error: 'No tenant found' }, { status: 400 })
    }

    const tenantId = (userTenant.tenant as unknown as { id: string }).id

    // Parse leads
    const body = await request.json()
    const { leads, searchId, searchName } = body as {
      leads: ApolloLead[]
      searchId?: string
      searchName?: string
    }

    if (!leads?.length) {
      return NextResponse.json({ error: 'No leads to import' }, { status: 400 })
    }

    // Use service client for DNC check (bypasses RLS)
    const serviceClient = createServiceClient()

    // Check DNC list
    const emails = leads.map((l) => l.email?.toLowerCase()).filter(Boolean) as string[]
    const domains = [...new Set(emails.map((e) => e.split('@')[1]).filter(Boolean))]

    const { data: dncEntries } = await serviceClient
      .from('do_not_contact')
      .select('email, domain')
      .eq('tenant_id', tenantId)
      .or(`email.in.(${emails.join(',')}),domain.in.(${domains.join(',')})`)

    const blockedEmails = new Set<string>()
    const blockedDomains = new Set<string>()

    dncEntries?.forEach((entry: { email: string | null; domain: string | null }) => {
      if (entry.email) blockedEmails.add(entry.email.toLowerCase())
      if (entry.domain) blockedDomains.add(entry.domain.toLowerCase())
    })

    // Filter out blocked leads
    const allowedLeads = leads.filter((lead) => {
      if (!lead.email) return false
      const email = lead.email.toLowerCase()
      if (blockedEmails.has(email)) return false
      const domain = email.split('@')[1]
      if (domain && blockedDomains.has(domain)) return false
      return true
    })

    if (allowedLeads.length === 0) {
      return NextResponse.json(
        { error: 'All leads are on the Do Not Contact list', imported: 0, blocked: leads.length },
        { status: 400 }
      )
    }

    // Emit Inngest events instead of direct DB insert
    // This flows through the same pipeline as pixel/intent leads
    const events = allowedLeads.map((lead) => ({
      name: 'lead.ingested' as const,
      data: {
        first_name: lead.first_name || 'Unknown',
        last_name: lead.last_name || '',
        email: lead.email,
        job_title: lead.title || undefined,
        headline: lead.headline || undefined,
        linkedin_url: lead.linkedin_url || undefined,
        company_name: lead.organization?.name || 'Unknown',
        company_linkedin_url: lead.organization?.linkedin_url || undefined,
        company_domain: extractDomain(lead.organization?.website_url),
        company_employee_count: lead.organization?.estimated_num_employees || undefined,
        company_industry: lead.organization?.industry || undefined,
        tenant_id: tenantId,
        source: 'apollo' as const,
        source_metadata: {
          apollo_id: lead.id,
          imported_at: new Date().toISOString(),
          search_id: searchId,
          search_name: searchName,
        },
      },
    }))

    // Send all events to Inngest
    await inngest.send(events)

    return NextResponse.json({
      imported: events.length,
      blocked: leads.length - allowedLeads.length,
      message: `${events.length} leads queued for processing`,
    })
  } catch (error) {
    console.error('Apollo import error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Import failed' },
      { status: 500 }
    )
  }
}

function extractDomain(url?: string): string | undefined {
  if (!url) return undefined
  try {
    const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`)
    return urlObj.hostname.replace('www.', '')
  } catch {
    return undefined
  }
}
