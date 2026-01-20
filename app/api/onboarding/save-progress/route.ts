import { NextResponse } from 'next/server'
import { createClient } from '@/src/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * Save onboarding progress to localStorage via client
 * This endpoint validates the user is authenticated and returns success
 * Actual storage happens client-side in localStorage
 */
export async function POST(request: Request) {
  try {
    // Verify user is authenticated
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { step, data } = body

    // For now, we just validate and return success
    // The actual progress is stored in localStorage on the client
    // This endpoint could be extended to store progress in Supabase if needed

    return NextResponse.json({
      success: true,
      step,
      savedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Save progress error:', error)
    return NextResponse.json({ error: 'Failed to save progress' }, { status: 500 })
  }
}
