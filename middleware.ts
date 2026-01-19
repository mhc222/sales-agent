import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_ROUTES = ['/login', '/signup', '/forgot-password', '/auth/callback']
const ACCOUNT_ROUTE = '/account'
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
    // If user is logged in and tries to access auth pages, redirect to account
    if (user) {
      return NextResponse.redirect(new URL('/account', request.url))
    }
    return response
  }

  // Redirect to login if not authenticated
  if (!user) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Allow account and onboarding routes without checking onboarding status
  if (pathname.startsWith(ACCOUNT_ROUTE) || pathname.startsWith(ONBOARDING_ROUTE)) {
    return response
  }

  // Check if user has at least one completed brand
  const { data: userTenants } = await supabase
    .from('user_tenants')
    .select('tenant:tenants(settings)')
    .eq('user_id', user.id)

  // Check if any tenant has completed onboarding
  const hasCompletedBrand = (userTenants || []).some((ut) => {
    const tenant = Array.isArray(ut.tenant) ? ut.tenant[0] : ut.tenant
    const settings = tenant?.settings as Record<string, unknown> | undefined
    return settings?.onboarding_completed === true
  })

  // If no completed brands, redirect to account page to manage brands
  if (!hasCompletedBrand) {
    return NextResponse.redirect(new URL('/account', request.url))
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
