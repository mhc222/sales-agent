'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'

export interface Tenant {
  id: string
  name: string
  slug: string
  role: 'owner' | 'admin' | 'member'
  created_at: string
}

interface TenantContextType {
  tenants: Tenant[]
  activeTenant: Tenant | null
  loading: boolean
  error: string | null
  switchTenant: (tenantId: string) => Promise<void>
  refreshTenants: () => Promise<void>
  createTenant: (name: string) => Promise<Tenant | null>
}

const TenantContext = createContext<TenantContextType | undefined>(undefined)

const ACTIVE_TENANT_KEY = 'active_tenant_id'

export function TenantProvider({ children }: { children: ReactNode }) {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [activeTenant, setActiveTenant] = useState<Tenant | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTenants = useCallback(async () => {
    try {
      const res = await fetch('/api/tenants')
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to load tenants')
        return
      }

      setTenants(data.tenants || [])

      // Determine active tenant
      const storedTenantId = localStorage.getItem(ACTIVE_TENANT_KEY)
      const tenantList = data.tenants || []

      if (tenantList.length > 0) {
        // Try to use stored tenant, fallback to first
        const stored = tenantList.find((t: Tenant) => t.id === storedTenantId)
        const active = stored || tenantList[0]
        setActiveTenant(active)
        localStorage.setItem(ACTIVE_TENANT_KEY, active.id)
      }
    } catch (err) {
      setError('Failed to load tenants')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTenants()
  }, [fetchTenants])

  const switchTenant = useCallback(async (tenantId: string) => {
    const tenant = tenants.find(t => t.id === tenantId)
    if (!tenant) {
      setError('Tenant not found')
      return
    }

    // Store in localStorage
    localStorage.setItem(ACTIVE_TENANT_KEY, tenantId)
    setActiveTenant(tenant)

    // Notify the server (for session consistency)
    try {
      await fetch('/api/tenants/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId }),
      })
    } catch (err) {
      console.error('Failed to sync tenant switch with server:', err)
    }

    // Reload the page to refresh all data for new tenant
    window.location.reload()
  }, [tenants])

  const createTenant = useCallback(async (name: string): Promise<Tenant | null> => {
    try {
      const res = await fetch('/api/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to create tenant')
        return null
      }

      // Refresh tenant list
      await fetchTenants()

      return data.tenant
    } catch (err) {
      setError('Failed to create tenant')
      return null
    }
  }, [fetchTenants])

  const refreshTenants = useCallback(async () => {
    setLoading(true)
    await fetchTenants()
  }, [fetchTenants])

  return (
    <TenantContext.Provider
      value={{
        tenants,
        activeTenant,
        loading,
        error,
        switchTenant,
        refreshTenants,
        createTenant,
      }}
    >
      {children}
    </TenantContext.Provider>
  )
}

export function useTenant() {
  const context = useContext(TenantContext)
  if (context === undefined) {
    throw new Error('useTenant must be used within a TenantProvider')
  }
  return context
}
