'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { jsb, cn } from '@/lib/styles'
import Link from 'next/link'

type Brand = {
  id: string
  name: string
  description: string | null
  website: string | null
  logo_url: string | null
  is_active: boolean
  setup_completed: boolean
  campaign_count: number
  created_at: string
}

export default function BrandsPage() {
  const router = useRouter()
  const [brands, setBrands] = useState<Brand[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchBrands()
  }, [])

  const fetchBrands = async () => {
    try {
      const res = await fetch('/api/brands')
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to fetch brands')
        return
      }

      setBrands(data.brands || [])
    } catch {
      setError('Failed to load brands')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-jsb-pink/30 border-t-jsb-pink rounded-full animate-spin" />
          <p className="text-gray-400">Loading brands...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className={cn(jsb.card, 'p-8 text-center max-w-md mx-auto')}>
          <h2 className={cn(jsb.heading, 'text-xl mb-4 text-red-400')}>Error</h2>
          <p className="text-gray-400 mb-6">{error}</p>
          <button
            onClick={() => fetchBrands()}
            className={cn(jsb.buttonSecondary, 'w-full py-3')}
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  // Empty state
  if (brands.length === 0) {
    return (
      <div className="p-6">
        <div className="max-w-2xl mx-auto">
          <div className={cn(jsb.card, 'p-12 text-center')}>
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-jsb-pink/10 flex items-center justify-center">
              <svg
                className="w-10 h-10 text-jsb-pink"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                />
              </svg>
            </div>
            <h2 className={cn(jsb.heading, 'text-2xl mb-3')}>No brands yet</h2>
            <p className="text-gray-400 mb-8 max-w-md mx-auto">
              Create your first brand to get started with campaigns. Each brand has its own ICP,
              integrations, and messaging.
            </p>
            <Link href="/brands/new" className={cn(jsb.buttonPrimary, 'inline-block px-8 py-3')}>
              Create Your First Brand
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Brands list
  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className={cn(jsb.heading, 'text-3xl mb-2')}>Brands</h1>
            <p className="text-gray-400">
              Manage your brands and their campaigns
            </p>
          </div>
          <Link href="/brands/new" className={cn(jsb.buttonPrimary, 'px-6 py-3')}>
            Create Brand
          </Link>
        </div>

        {/* Brands Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {brands.map((brand) => (
            <Link
              key={brand.id}
              href={`/brands/${brand.id}`}
              className={cn(
                jsb.card,
                'p-6 hover:border-jsb-pink/50 transition-all duration-200 group'
              )}
            >
              {/* Brand Header */}
              <div className="flex items-start gap-4 mb-4">
                {/* Logo */}
                {brand.logo_url ? (
                  <div className="w-14 h-14 rounded-lg overflow-hidden bg-jsb-navy-lighter flex-shrink-0">
                    <img
                      src={brand.logo_url}
                      alt={brand.name}
                      className="w-full h-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="w-14 h-14 rounded-lg bg-jsb-pink/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-jsb-pink text-xl font-bold">
                      {brand.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}

                {/* Brand Name & Status */}
                <div className="flex-1 min-w-0">
                  <h3 className={cn(jsb.heading, 'text-lg mb-1 truncate group-hover:text-jsb-pink transition-colors')}>
                    {brand.name}
                  </h3>
                  <div className="flex items-center gap-2">
                    {brand.setup_completed ? (
                      <span className="text-xs text-green-400">Setup complete</span>
                    ) : (
                      <span className="text-xs text-yellow-400">Setup incomplete</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Description */}
              {brand.description && (
                <p className="text-sm text-gray-400 mb-4 line-clamp-2">{brand.description}</p>
              )}

              {/* Website */}
              {brand.website && (
                <div className="text-xs text-gray-500 mb-4 truncate">
                  {brand.website}
                </div>
              )}

              {/* Stats */}
              <div className="flex items-center justify-between pt-4 border-t border-jsb-navy-lighter">
                <div className="text-sm">
                  <span className="text-gray-400">Campaigns:</span>{' '}
                  <span className="text-white font-medium">{brand.campaign_count || 0}</span>
                </div>
                <svg
                  className="w-5 h-5 text-gray-500 group-hover:text-jsb-pink transition-colors"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
