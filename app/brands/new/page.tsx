'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import BrandWizard from '@/components/brands/BrandWizard'
import { jsb, cn } from '@/lib/styles'

export default function NewBrandPage() {
  const router = useRouter()
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get tenant ID from localStorage or API
    const activeTenantId = localStorage.getItem('active_tenant_id')

    if (!activeTenantId) {
      // If no tenant, fetch the user's first tenant
      fetch('/api/tenants')
        .then((res) => res.json())
        .then((data) => {
          if (data.tenants && data.tenants.length > 0) {
            const firstTenant = data.tenants[0]
            setTenantId(firstTenant.id)
            localStorage.setItem('active_tenant_id', firstTenant.id)
          } else {
            // No tenant found - redirect to create one
            router.push('/account')
          }
        })
        .catch(() => {
          router.push('/account')
        })
        .finally(() => {
          setLoading(false)
        })
    } else {
      setTenantId(activeTenantId)
      setLoading(false)
    }
  }, [router])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-jsb-pink/30 border-t-jsb-pink rounded-full animate-spin" />
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    )
  }

  if (!tenantId) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className={cn(jsb.card, 'p-8 text-center max-w-md')}>
          <h2 className={cn(jsb.heading, 'text-xl mb-4')}>No Account Found</h2>
          <p className="text-gray-400 mb-6">
            You need an account before creating a brand.
          </p>
          <button
            onClick={() => router.push('/account')}
            className={cn(jsb.buttonPrimary, 'w-full py-3')}
          >
            Go to Account
          </button>
        </div>
      </div>
    )
  }

  return <BrandWizard tenantId={tenantId} />
}
