import { createClient } from './supabase-server'
import { redirect } from 'next/navigation'

export type User = {
  id: string
  email: string
  full_name?: string
  avatar_url?: string
}

export type UserTenant = {
  id: string
  user_id: string
  tenant_id: string
  role: 'owner' | 'admin' | 'member'
  tenant?: {
    id: string
    name: string
    slug: string
    settings: Record<string, unknown>
  }
}

export async function getUser(): Promise<User | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return null

  // Get user profile from users table
  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single()

  return profile || {
    id: user.id,
    email: user.email!,
    full_name: user.user_metadata?.full_name,
    avatar_url: user.user_metadata?.avatar_url,
  }
}

export async function getSession() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

export async function getUserTenants(): Promise<UserTenant[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return []

  const { data: userTenants } = await supabase
    .from('user_tenants')
    .select(`
      *,
      tenant:tenants (
        id,
        name,
        slug,
        settings
      )
    `)
    .eq('user_id', user.id)

  return userTenants || []
}

export async function getCurrentTenant(): Promise<UserTenant | null> {
  const tenants = await getUserTenants()
  // Return first tenant for now - can implement tenant switching later
  return tenants[0] || null
}

export async function requireAuth() {
  const user = await getUser()
  if (!user) {
    redirect('/login')
  }
  return user
}

export async function requireOnboarding() {
  const user = await getUser()
  if (!user) {
    redirect('/login')
  }

  const tenant = await getCurrentTenant()
  if (!tenant?.tenant?.settings?.onboarding_completed) {
    redirect('/onboarding')
  }

  return { user, tenant }
}

export async function checkOnboardingComplete(): Promise<boolean> {
  const tenant = await getCurrentTenant()
  return tenant?.tenant?.settings?.onboarding_completed === true
}

/**
 * Get the current tenant ID for API routes.
 * Returns null if not authenticated or no tenant found.
 */
export async function getTenantId(request?: Request): Promise<string | null> {
  const tenant = await getCurrentTenant()
  return tenant?.tenant_id || null
}
