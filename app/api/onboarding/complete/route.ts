import { NextResponse } from 'next/server'
import { createClient } from '@/src/lib/supabase-server'
import { createServiceClient } from '@/src/lib/supabase-server'

export async function POST(request: Request) {
  try {
    // Verify user is authenticated
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { company, emailProvider, apollo, linkedIn, dnc } = body

    // Validate required fields
    if (!company?.companyName || !company?.yourName) {
      return NextResponse.json({ error: 'Company information is required' }, { status: 400 })
    }

    if (!emailProvider?.provider || !emailProvider?.apiKey) {
      return NextResponse.json({ error: 'Email provider is required' }, { status: 400 })
    }

    if (!apollo?.apiKey) {
      return NextResponse.json({ error: 'Apollo API key is required' }, { status: 400 })
    }

    // Use service client for admin operations (bypasses RLS)
    const serviceClient = createServiceClient()

    // Create tenant
    const slug = company.companyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')

    const settings = {
      integrations: {
        apollo: { api_key: apollo.apiKey },
        [emailProvider.provider]: {
          api_key: emailProvider.apiKey,
          ...(emailProvider.campaignId && { campaign_id: emailProvider.campaignId }),
        },
        ...(linkedIn.provider && !linkedIn.skip && {
          heyreach: { api_key: linkedIn.apiKey },
        }),
      },
      active_email_provider: emailProvider.provider,
      active_linkedin_provider: linkedIn.skip ? null : 'heyreach',
      onboarding_completed: true,
      research_sources: ['apollo', 'perplexity'],
      enabled_channels: linkedIn.skip ? ['email'] : ['email', 'linkedin'],
    }

    const { data: tenant, error: tenantError } = await serviceClient
      .from('tenants')
      .insert({
        name: company.companyName,
        slug,
        settings,
      })
      .select()
      .single()

    if (tenantError) {
      console.error('Tenant creation error:', tenantError)
      // Check if slug already exists
      if (tenantError.code === '23505') {
        return NextResponse.json({ error: 'A company with this name already exists' }, { status: 400 })
      }
      return NextResponse.json({ error: 'Failed to create company' }, { status: 500 })
    }

    // Update user profile with name
    const { error: userError } = await serviceClient
      .from('users')
      .update({ full_name: company.yourName })
      .eq('id', user.id)

    if (userError) {
      console.error('User update error:', userError)
      // Non-fatal, continue
    }

    // Create user-tenant association
    const { error: assocError } = await serviceClient
      .from('user_tenants')
      .insert({
        user_id: user.id,
        tenant_id: tenant.id,
        role: 'owner',
      })

    if (assocError) {
      console.error('User-tenant association error:', assocError)
      return NextResponse.json({ error: 'Failed to link user to company' }, { status: 500 })
    }

    // Add DNC entries if provided
    if (dnc?.entries?.length > 0 && !dnc.skip) {
      const dncEntries = dnc.entries.map((entry: { type: string; value: string }) => ({
        tenant_id: tenant.id,
        email: entry.type === 'email' ? entry.value : null,
        domain: entry.type === 'domain' ? entry.value : null,
        reason: 'Added during onboarding',
        added_by: user.id,
      }))

      const { error: dncError } = await serviceClient
        .from('do_not_contact')
        .insert(dncEntries)

      if (dncError) {
        console.error('DNC insert error:', dncError)
        // Non-fatal, continue
      }
    }

    return NextResponse.json({
      success: true,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
      },
    })
  } catch (error) {
    console.error('Onboarding complete error:', error)
    return NextResponse.json({ error: 'Failed to complete setup' }, { status: 500 })
  }
}
