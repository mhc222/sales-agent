import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/src/lib/supabase-server'
import { createApolloClient, INDUSTRY_IDS } from '@/src/lib/apollo'

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

    // Get user's tenant and Apollo API key
    const { data: userTenant } = await supabase
      .from('user_tenants')
      .select('tenant:tenants(id, settings)')
      .eq('user_id', user.id)
      .single()

    if (!userTenant?.tenant) {
      return NextResponse.json({ error: 'No tenant found' }, { status: 400 })
    }

    const tenant = userTenant.tenant as unknown as { id: string; settings: Record<string, unknown> }
    const tenantId = tenant.id
    const settings = tenant.settings
    const integrations = settings?.integrations as Record<string, unknown>
    const apolloConfig = integrations?.apollo as Record<string, string>
    const apolloApiKey = apolloConfig?.api_key

    if (!apolloApiKey) {
      return NextResponse.json({ error: 'Apollo API key not configured' }, { status: 400 })
    }

    // Parse search parameters
    const body = await request.json()
    const { jobTitles, industry, locations, employeeRange, page = 1, saveSearch, scheduleCron, nlQuery } =
      body

    // Build Apollo search params
    const apollo = createApolloClient(apolloApiKey)

    const industryIds: string[] = []
    if (industry) {
      const industryId = INDUSTRY_IDS[industry.toLowerCase()]
      if (industryId) {
        industryIds.push(industryId)
      }
    }

    const searchParams = {
      jobTitles: jobTitles || [],
      industryIds,
      locations: locations || [],
      employeeRange: employeeRange || undefined,
    }

    const result = await apollo.searchPeople({
      ...searchParams,
      page,
      perPage: 25,
    })

    // Optionally save the search
    if (saveSearch && saveSearch.name) {
      const serviceClient = createServiceClient()

      // Store the raw params for future searches
      const savedSearchParams = {
        jobTitles: jobTitles || [],
        industry: industry || null,
        locations: locations || [],
        employeeRange: employeeRange || null,
      }

      await serviceClient.from('apollo_saved_searches').insert({
        tenant_id: tenantId,
        name: saveSearch.name,
        description: saveSearch.description || null,
        search_params: savedSearchParams,
        nl_query: nlQuery || null,
        schedule_cron: scheduleCron || null,
        enabled: true,
      })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Apollo search error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Search failed' },
      { status: 500 }
    )
  }
}
