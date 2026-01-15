import { NextRequest, NextResponse } from 'next/server'
import { inngest } from '../../../inngest/client'

/**
 * Cron endpoint to trigger daily learning analysis
 * Runs at 6 AM UTC daily via Vercel cron
 */
export async function GET(request: NextRequest) {
  // Verify it's a cron job (or authorized request)
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    console.error('[Learning Cron] Unauthorized request')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    console.log('[Learning Cron] Starting daily learning analysis...')

    const tenantId = process.env.TENANT_ID

    if (!tenantId) {
      throw new Error('Missing TENANT_ID environment variable')
    }

    // Trigger learning analysis via Inngest
    // The Inngest function handles multi-tenant analysis if needed
    await inngest.send({
      name: 'learning.analyze-requested',
      data: {
        tenant_id: tenantId,
      },
    })

    console.log('[Learning Cron] Successfully triggered learning analysis')

    return NextResponse.json({
      status: 'success',
      message: 'Learning analysis triggered',
      tenant_id: tenantId,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[Learning Cron] Error:', error)
    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}
