import { NextResponse } from 'next/server'
import { createClient } from '@/src/lib/supabase-server'
import { calculateTriggerReadiness, type TriggerReadinessInput } from '@/src/lib/trigger-readiness'

export const dynamic = 'force-dynamic'

interface ResearchSignals {
  persona_match?: { type: string; decision_level: string }
  triggers?: Array<{ type?: string; fact?: string }>
  enhanced?: {
    intentScore?: number
    intentTier?: 'hot' | 'warm' | 'cold' | 'research'
    painSignals?: Array<{ topic: string; confidence: string }>
    compositeTriggers?: Record<string, boolean>
    outreachGuidance?: {
      urgency?: 'high' | 'medium' | 'low'
    }
  }
}

export async function GET() {
  try {
    const supabase = await createClient()

    // Verify user is authenticated and get tenant
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's tenant
    const { data: userTenant } = await supabase
      .from('user_tenants')
      .select('tenant_id')
      .eq('user_id', user.id)
      .single()

    if (!userTenant) {
      return NextResponse.json({ error: 'No tenant found' }, { status: 404 })
    }

    // Fetch holding leads with their research and engagement data
    const { data: leads, error } = await supabase
      .from('leads')
      .select(
        `
        id,
        first_name,
        last_name,
        email,
        company_name,
        job_title,
        source,
        created_at,
        updated_at,
        research_records (
          extracted_signals
        )
      `
      )
      .eq('tenant_id', userTenant.tenant_id)
      .eq('status', 'holding')
      .order('updated_at', { ascending: false })
      .limit(100)

    if (error) {
      console.error('Error fetching holding leads:', error)
      return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 })
    }

    // Get recent engagement logs for these leads
    const leadIds = leads?.map((l) => l.id) || []
    const { data: engagementLogs } = await supabase
      .from('engagement_log')
      .select('lead_id, event_type, metadata, created_at')
      .in('lead_id', leadIds)
      .in('event_type', ['lead.held_insufficient_triggers', 'lead.holding_reevaluated'])
      .order('created_at', { ascending: false })

    // Build a map of latest engagement per lead
    const engagementMap = new Map<string, { metadata: Record<string, unknown>; created_at: string }>()
    engagementLogs?.forEach((log) => {
      if (!engagementMap.has(log.lead_id)) {
        engagementMap.set(log.lead_id, {
          metadata: log.metadata as Record<string, unknown>,
          created_at: log.created_at,
        })
      }
    })

    // Process leads and calculate current trigger readiness
    const processedLeads = (leads || []).map((lead) => {
      const research = (lead.research_records as Array<{ extracted_signals: ResearchSignals }> | null)?.[0]
        ?.extracted_signals
      const engagement = engagementMap.get(lead.id)

      // Calculate current trigger readiness
      let triggerReadiness = null
      if (research?.enhanced) {
        const contextProfile: TriggerReadinessInput = {
          outreachGuidance: {
            urgency: research.enhanced.outreachGuidance?.urgency || 'low',
            compositeTriggers: research.enhanced.compositeTriggers || {},
          },
          engagementStrategy: {
            triggerEvent: research.triggers?.[0]?.fact || null,
            urgencyLevel: research.enhanced.outreachGuidance?.urgency || 'low',
          },
        }
        triggerReadiness = calculateTriggerReadiness(contextProfile, lead.source || 'apollo')
      }

      // Get missing triggers from engagement log or calculate
      const missingTriggers =
        (engagement?.metadata?.missing_triggers as string[]) ||
        triggerReadiness?.missingTriggers ||
        ['No research data']

      // Calculate days until next evaluation
      const nextEvaluation = engagement?.metadata?.next_evaluation as string | undefined
      const daysUntilEval = nextEvaluation
        ? Math.max(0, Math.ceil((new Date(nextEvaluation).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
        : null

      return {
        id: lead.id,
        name: `${lead.first_name} ${lead.last_name}`,
        email: lead.email,
        company: lead.company_name,
        title: lead.job_title,
        source: lead.source,
        heldAt: lead.updated_at,
        triggerScore: triggerReadiness?.score ?? (engagement?.metadata?.trigger_score as number) ?? 0,
        triggerTier: triggerReadiness?.tier ?? (engagement?.metadata?.trigger_tier as string) ?? 'hold',
        missingTriggers,
        reasons: triggerReadiness?.reasons || [],
        strongestTrigger: triggerReadiness?.strongestTrigger || null,
        nextEvaluation,
        daysUntilEval,
        intentScore: research?.enhanced?.intentScore || null,
        intentTier: research?.enhanced?.intentTier || null,
        personaType: research?.persona_match?.type || null,
      }
    })

    // Calculate summary stats
    const stats = {
      total: processedLeads.length,
      avgScore: processedLeads.length
        ? Math.round(processedLeads.reduce((sum, l) => sum + l.triggerScore, 0) / processedLeads.length)
        : 0,
      nearThreshold: processedLeads.filter((l) => l.triggerScore >= 40 && l.triggerScore < 50).length,
      byTier: {
        nurture: processedLeads.filter((l) => l.triggerTier === 'nurture').length,
        hold: processedLeads.filter((l) => l.triggerTier === 'hold').length,
      },
    }

    return NextResponse.json({
      leads: processedLeads,
      stats,
    })
  } catch (error) {
    console.error('Holding leads API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
