'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { jsb, cn } from '@/lib/styles'

interface Brand {
  id: string
  name: string
  slug: string
  role: 'owner' | 'admin' | 'member'
  onboarding_completed: boolean
  created_at: string
}

export default function AccountPage() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [newBrandName, setNewBrandName] = useState('')
  const [createLoading, setCreateLoading] = useState(false)
  const router = useRouter()

  useEffect(() => {
    fetchBrands()
  }, [])

  const fetchBrands = async () => {
    try {
      const res = await fetch('/api/account/brands')
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to load brands')
        return
      }

      setBrands(data.brands || [])
    } catch (err) {
      setError('Failed to load brands')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateBrand = async () => {
    if (!newBrandName.trim()) return

    setCreateLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newBrandName.trim() }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to create brand')
        setCreateLoading(false)
        return
      }

      // Switch to the new tenant and go to onboarding
      localStorage.setItem('active_tenant_id', data.tenant.id)

      // Set cookie via API
      await fetch('/api/tenants/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: data.tenant.id }),
      })

      router.push('/onboarding')
    } catch (err) {
      setError('Failed to create brand')
      setCreateLoading(false)
    }
  }

  const handleSelectBrand = async (brand: Brand) => {
    // Switch to this tenant
    localStorage.setItem('active_tenant_id', brand.id)

    await fetch('/api/tenants/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId: brand.id }),
    })

    if (brand.onboarding_completed) {
      router.push('/dashboard')
    } else {
      router.push('/onboarding')
    }
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-jsb-navy flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-400">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading...
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-jsb-navy">
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-jsb-pink to-jsb-pink-hover flex items-center justify-center mx-auto mb-6">
            <span className="text-white font-bold text-2xl">J</span>
          </div>
          <h1 className={cn(jsb.heading, 'text-3xl mb-2')}>Your Brands</h1>
          <p className="text-gray-400">Select a brand to continue or create a new one</p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/30">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Brands Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-8">
          {brands.map((brand) => (
            <button
              key={brand.id}
              onClick={() => handleSelectBrand(brand)}
              className={cn(
                jsb.card,
                'p-6 text-left transition-all duration-200',
                'hover:border-jsb-pink/50 hover:bg-jsb-pink/5',
                'group'
              )}
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-jsb-pink/80 to-jsb-pink flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-bold">{getInitials(brand.name)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-white truncate group-hover:text-jsb-pink transition-colors">
                    {brand.name}
                  </h3>
                  <p className="text-sm text-gray-500 capitalize">{brand.role}</p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between">
                {brand.onboarding_completed ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Ready
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs text-amber-400">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Setup required
                  </span>
                )}

                <svg
                  className="w-5 h-5 text-gray-500 group-hover:text-jsb-pink group-hover:translate-x-1 transition-all"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          ))}

          {/* Add New Brand Card */}
          {!isCreating ? (
            <button
              onClick={() => setIsCreating(true)}
              className={cn(
                jsb.card,
                'p-6 text-left transition-all duration-200',
                'hover:border-jsb-pink/50 hover:bg-jsb-pink/5',
                'border-dashed',
                'group'
              )}
            >
              <div className="flex items-center justify-center h-full min-h-[120px]">
                <div className="text-center">
                  <div className="w-12 h-12 rounded-xl bg-jsb-navy-lighter border-2 border-dashed border-gray-600 flex items-center justify-center mx-auto mb-3 group-hover:border-jsb-pink/50 transition-colors">
                    <svg className="w-6 h-6 text-gray-500 group-hover:text-jsb-pink transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                  <p className="text-sm text-gray-400 group-hover:text-white transition-colors">Add New Brand</p>
                </div>
              </div>
            </button>
          ) : (
            <div className={cn(jsb.card, 'p-6')}>
              <h3 className="font-medium text-white mb-4">New Brand</h3>
              <input
                type="text"
                value={newBrandName}
                onChange={(e) => setNewBrandName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateBrand()
                  if (e.key === 'Escape') {
                    setIsCreating(false)
                    setNewBrandName('')
                  }
                }}
                placeholder="Brand name..."
                className={cn(
                  'w-full px-3 py-2 rounded-lg text-sm mb-4',
                  'bg-jsb-navy-lighter border border-white/10',
                  'text-white placeholder-gray-500',
                  'focus:border-jsb-pink focus:outline-none'
                )}
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={handleCreateBrand}
                  disabled={!newBrandName.trim() || createLoading}
                  className={cn(
                    'flex-1 px-4 py-2 rounded-lg text-sm font-medium',
                    'bg-jsb-pink text-white',
                    'hover:bg-jsb-pink/90 transition-colors',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                >
                  {createLoading ? 'Creating...' : 'Create & Setup'}
                </button>
                <button
                  onClick={() => {
                    setIsCreating(false)
                    setNewBrandName('')
                  }}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Empty State */}
        {brands.length === 0 && !isCreating && (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-full bg-jsb-navy-lighter flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-white mb-2">No brands yet</h3>
            <p className="text-gray-400 mb-6">Create your first brand to get started</p>
            <button
              onClick={() => setIsCreating(true)}
              className={cn(
                'px-6 py-3 rounded-lg font-medium',
                'bg-jsb-pink text-white',
                'hover:bg-jsb-pink/90 transition-colors'
              )}
            >
              Create Your First Brand
            </button>
          </div>
        )}

        {/* Sign Out Link */}
        <div className="text-center mt-8">
          <button
            onClick={async () => {
              await fetch('/api/auth/signout', { method: 'POST' })
              router.push('/login')
            }}
            className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
