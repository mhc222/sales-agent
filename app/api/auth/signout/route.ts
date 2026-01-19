import { NextResponse } from 'next/server'
import { createClient } from '@/src/lib/supabase-server'

/**
 * POST /api/auth/signout
 * Sign out the current user
 */
export async function POST() {
  try {
    const supabase = await createClient()
    await supabase.auth.signOut()

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Sign out error:', error)
    return NextResponse.json({ error: 'Failed to sign out' }, { status: 500 })
  }
}
