import { createClient } from '@/src/lib/supabase-server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const type = requestUrl.searchParams.get('type')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Check if this is a password recovery
      if (type === 'recovery') {
        // Redirect to password update page (could add later)
        return NextResponse.redirect(new URL('/dashboard', request.url))
      }

      // Check if user has completed onboarding
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        const { data: userTenant } = await supabase
          .from('user_tenants')
          .select('tenant:tenants(settings)')
          .eq('user_id', user.id)
          .single()

        const settings = (userTenant?.tenant as any)?.settings as Record<string, unknown> | undefined
        const onboardingComplete = settings?.onboarding_completed === true

        if (!userTenant || !onboardingComplete) {
          return NextResponse.redirect(new URL('/onboarding', request.url))
        }
      }

      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(new URL('/login?error=auth_failed', request.url))
}
