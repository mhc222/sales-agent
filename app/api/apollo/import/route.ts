import { NextResponse } from 'next/server'
import { createClient } from '@/src/lib/supabase-server'
import { createServiceClient } from '@/src/lib/supabase-server'
import type { ApolloLead } from '@/src/lib/apollo'

export async function POST(request: Request) {
  try {
    // Verify user is authenticated
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

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

    const tenantId = (userTenant.tenant as any).id as string

    // Parse leads
    const body = await request.json()
    const { leads } = body as { leads: ApolloLead[] }

    if (!leads?.length) {
      return NextResponse.json({ error: 'No leads to import' }, { status: 400 })
    }

    // Use service client for inserting leads (bypasses RLS)
    const serviceClient = createServiceClient()

    // Check DNC list
    const emails = leads.map((l) => l.email?.toLowerCase()).filter(Boolean)
    const domains = emails.map((e) => e.split('@')[1]).filter(Boolean)

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
      return NextResponse.json({ error: 'All leads are on the Do Not Contact list' }, { status: 400 })
    }

    // Transform Apollo leads to our lead format
    const leadsToInsert = allowedLeads.map((lead) => ({
      tenant_id: tenantId,
      first_name: lead.first_name || 'Unknown',
      last_name: lead.last_name || '',
      email: lead.email,
      job_title: lead.title,
      headline: lead.headline,
      linkedin_url: lead.linkedin_url,
      company_name: lead.organization?.name || 'Unknown',
      company_linkedin_url: lead.organization?.linkedin_url,
      company_domain: lead.organization?.website_url
        ? new URL(lead.organization.website_url.startsWith('http') ? lead.organization.website_url : `https://${lead.organization.website_url}`).hostname.replace('www.', '')
        : undefined,
      company_employee_count: lead.organization?.estimated_num_employees,
      company_industry: lead.organization?.industry,
      status: 'ingested',
      source: 'apollo_search',
      intent_signal: {
        source: 'apollo',
        imported_at: new Date().toISOString(),
        apollo_id: lead.id,
      },
    }))

    // Insert leads (upsert on email to avoid duplicates)
    const { data: insertedLeads, error: insertError } = await serviceClient
      .from('leads')
      .upsert(leadsToInsert, {
        onConflict: 'tenant_id,email',
        ignoreDuplicates: false,
      })
      .select('id')

    if (insertError) {
      console.error('Lead insert error:', insertError)
      return NextResponse.json({ error: 'Failed to import leads' }, { status: 500 })
    }

    // Log import event
    const importedCount = insertedLeads?.length || leadsToInsert.length

    return NextResponse.json({
      imported: importedCount,
      blocked: leads.length - allowedLeads.length,
    })
  } catch (error) {
    console.error('Apollo import error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Import failed' },
      { status: 500 }
    )
  }
}
