'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
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
  settings: any
  icp: any
  created_at: string
}

export default function BrandDetailPage() {
  const router = useRouter()
  const params = useParams()
  const brandId = params.id as string

  const [brand, setBrand] = useState<Brand | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (brandId) {
      fetchBrand()
    }
  }, [brandId])

  const fetchBrand = async () => {
    try {
      const res = await fetch(`/api/brands/${brandId}`)
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to fetch brand')
        return
      }

      setBrand(data.brand)
    } catch {
      setError('Failed to load brand')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-jsb-pink/30 border-t-jsb-pink rounded-full animate-spin" />
          <p className="text-gray-400">Loading brand...</p>
        </div>
      </div>
    )
  }

  if (error || !brand) {
    return (
      <div className="p-6">
        <div className={cn(jsb.card, 'p-8 text-center max-w-md mx-auto')}>
          <h2 className={cn(jsb.heading, 'text-xl mb-4 text-red-400')}>Error</h2>
          <p className="text-gray-400 mb-6">{error || 'Brand not found'}</p>
          <Link href="/brands" className={cn(jsb.buttonSecondary, 'inline-block px-6 py-3')}>
            Back to Brands
          </Link>
        </div>
      </div>
    )
  }

  const hasSettings = brand.settings && Object.keys(brand.settings).length > 0
  const hasICP = brand.icp && Object.keys(brand.icp).length > 0
  const enabledChannels = brand.settings?.enabled_channels || []

  return (
    <div className="p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/brands"
            className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-4"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Brands
          </Link>

          <div className="flex items-start gap-6">
            {/* Logo */}
            {brand.logo_url ? (
              <div className="w-20 h-20 rounded-lg overflow-hidden bg-jsb-navy-lighter flex-shrink-0">
                <img src={brand.logo_url} alt={brand.name} className="w-full h-full object-contain" />
              </div>
            ) : (
              <div className="w-20 h-20 rounded-lg bg-jsb-pink/10 flex items-center justify-center flex-shrink-0">
                <span className="text-jsb-pink text-3xl font-bold">
                  {brand.name.charAt(0).toUpperCase()}
                </span>
              </div>
            )}

            {/* Brand Info */}
            <div className="flex-1">
              <h1 className={cn(jsb.heading, 'text-3xl mb-2')}>{brand.name}</h1>
              {brand.description && <p className="text-gray-400 mb-3">{brand.description}</p>}
              {brand.website && (
                <a
                  href={brand.website.startsWith('http') ? brand.website : `https://${brand.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-jsb-pink hover:underline"
                >
                  {brand.website}
                </a>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <Link
                href={`/campaigns/new?brand=${brand.id}`}
                className={cn(jsb.buttonPrimary, 'px-6 py-3')}
              >
                Create Campaign
              </Link>
            </div>
          </div>
        </div>

        {/* Setup Status Banner */}
        {!brand.setup_completed && (
          <div className="mb-6 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className="text-sm text-yellow-400">Brand setup is incomplete</span>
            </div>
          </div>
        )}

        {/* Configuration Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Channels */}
          <div className={cn(jsb.card, 'p-6')}>
            <h3 className={cn(jsb.heading, 'text-lg mb-4')}>Channels</h3>
            {enabledChannels.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {enabledChannels.map((channel: string) => (
                  <span
                    key={channel}
                    className="px-3 py-1 rounded-full bg-jsb-pink/10 text-jsb-pink text-sm capitalize"
                  >
                    {channel}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">No channels configured</p>
            )}
          </div>

          {/* AI Provider */}
          <div className={cn(jsb.card, 'p-6')}>
            <h3 className={cn(jsb.heading, 'text-lg mb-4')}>AI Provider</h3>
            {brand.settings?.llm_provider ? (
              <div className="flex items-center gap-2">
                <span className="capitalize text-white">{brand.settings.llm_provider}</span>
                <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            ) : (
              <p className="text-gray-500 text-sm">Not configured</p>
            )}
          </div>

          {/* ICP */}
          <div className={cn(jsb.card, 'p-6')}>
            <h3 className={cn(jsb.heading, 'text-lg mb-4')}>ICP Research</h3>
            {hasICP ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-gray-400">
                    {brand.icp.personas?.length || 0} personas defined
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-gray-400">
                    {brand.icp.triggers?.length || 0} triggers identified
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-gray-500 text-sm">Not completed</p>
            )}
          </div>

          {/* Integrations */}
          <div className={cn(jsb.card, 'p-6')}>
            <h3 className={cn(jsb.heading, 'text-lg mb-4')}>Integrations</h3>
            {hasSettings && brand.settings.integrations ? (
              <div className="space-y-2">
                {Object.keys(brand.settings.integrations).map((integration) => (
                  <div key={integration} className="flex items-center gap-2 text-sm">
                    <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-gray-400 capitalize">{integration}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">No integrations configured</p>
            )}
          </div>
        </div>

        {/* Campaigns Section */}
        <div className={cn(jsb.card, 'p-6')}>
          <div className="flex items-center justify-between mb-4">
            <h3 className={cn(jsb.heading, 'text-lg')}>Campaigns</h3>
            <Link
              href={`/campaigns/new?brand=${brand.id}`}
              className={cn(jsb.buttonSecondary, 'px-4 py-2 text-sm')}
            >
              New Campaign
            </Link>
          </div>
          <p className="text-gray-400 text-sm">
            View and manage campaigns for this brand in the{' '}
            <Link href="/campaigns" className="text-jsb-pink hover:underline">
              Campaigns page
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
