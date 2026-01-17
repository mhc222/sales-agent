import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_ROUTES = ['/login', '/signup', '/forgot-password', '/auth/callback']
const ONBOARDING_ROUTE = '/onboarding'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow static files, API webhooks, and onboarding API
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/webhooks') ||
    pathname.startsWith('/api/cron') ||
    pathname.startsWith('/api/inngest') ||
    pathname.startsWith('/api/onboarding') ||
    pathname.includes('.') // Static files
  ) {
    return NextResponse.next()
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options as any)
          )
        },
      },
    }
  )

  // Refresh session if expired
  const { data: { user } } = await supabase.auth.getUser()

  // Allow public routes
  if (PUBLIC_ROUTES.some(route => pathname.startsWith(route))) {
    // If user is logged in and tries to access auth pages, redirect to dashboard
    if (user) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    return response
  }

  // Redirect to login if not authenticated
  if (!user) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Check onboarding status (skip for onboarding route itself)
  if (!pathname.startsWith(ONBOARDING_ROUTE)) {
    // Get user's tenant and check onboarding
    const { data: userTenant } = await supabase
      .from('user_tenants')
      .select('tenant:tenants(settings)')
      .eq('user_id', user.id)
      .single()

    const settings = (userTenant?.tenant as any)?.settings as Record<string, unknown> | undefined
    const onboardingComplete = settings?.onboarding_completed === true

    // If user has no tenant or onboarding not complete, redirect to onboarding
    if (!userTenant || !onboardingComplete) {
      return NextResponse.redirect(new URL('/onboarding', request.url))
    }
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
