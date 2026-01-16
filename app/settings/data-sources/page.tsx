'use client'

import { useState, useEffect } from 'react'
import { Shell } from '@/components/layout/Shell'
import DataSourceCard from '@/components/settings/DataSourceCard'
import { jsb, cn } from '@/lib/styles'

interface DataSourcesConfig {
  apollo: {
    enabled: boolean
    api_key_masked: string | null
  }
  pixel: {
    enabled: boolean
    api_url: string
    api_key_masked: string | null
  }
  intent: {
    enabled: boolean
    api_url: string
    api_key_masked: string | null
  }
}

export default function DataSourcesPage() {
  const [config, setConfig] = useState<DataSourcesConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchConfig()
  }, [])

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/settings/data-sources')
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to load configuration')
        return
      }

      setConfig(data)
    } catch (err) {
      setError('Failed to load data source configuration')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (
    source: 'apollo' | 'pixel' | 'intent',
    data: { api_key?: string; api_url?: string; enabled: boolean }
  ) => {
    const res = await fetch('/api/settings/data-sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, ...data }),
    })

    if (!res.ok) {
      const errorData = await res.json()
      throw new Error(errorData.error || 'Failed to save')
    }

    // Refresh config
    await fetchConfig()
  }

  const handleTest = async (
    source: 'apollo' | 'pixel' | 'intent',
    data: { api_key: string; api_url?: string }
  ) => {
    const res = await fetch('/api/settings/data-sources/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, ...data }),
    })

    return res.json()
  }

  if (loading) {
    return (
      <Shell>
        <div className="p-6 lg:p-8">
          <div className="flex items-center justify-center h-64">
            <div className="flex items-center gap-3 text-gray-400">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Loading configuration...
            </div>
          </div>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <div className="p-6 lg:p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className={cn(jsb.heading, 'text-2xl mb-2')}>Data Sources</h1>
          <p className="text-gray-400">
            Configure your lead data sources. Each source is optional and can be enabled independently.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/30">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {config && (
          <div className="space-y-6">
            {/* Apollo */}
            <DataSourceCard
              name="apollo"
              title="Apollo"
              description="Search and import leads from Apollo.io"
              icon={
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              }
              enabled={config.apollo.enabled}
              apiKeyMasked={config.apollo.api_key_masked}
              showApiUrl={false}
              onSave={(data) => handleSave('apollo', data)}
              onTest={(data) => handleTest('apollo', data)}
            />

            {/* Pixel */}
            <DataSourceCard
              name="pixel"
              title="Pixel (Website Visitors)"
              description="Identify visitors on your website via AudienceLab pixel"
              icon={
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              }
              enabled={config.pixel.enabled}
              apiKeyMasked={config.pixel.api_key_masked}
              apiUrl={config.pixel.api_url}
              showApiUrl={true}
              onSave={(data) => handleSave('pixel', data)}
              onTest={(data) => handleTest('pixel', data)}
            />

            {/* Intent */}
            <DataSourceCard
              name="intent"
              title="Intent Data"
              description="Import leads showing buying intent signals"
              icon={
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              }
              enabled={config.intent.enabled}
              apiKeyMasked={config.intent.api_key_masked}
              apiUrl={config.intent.api_url}
              showApiUrl={true}
              onSave={(data) => handleSave('intent', data)}
              onTest={(data) => handleTest('intent', data)}
            />

            {/* Info card */}
            <div className={cn(jsb.card, 'p-6')}>
              <h3 className={cn(jsb.heading, 'text-sm mb-2')}>How it works</h3>
              <ul className="text-sm text-gray-400 space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-jsb-pink mt-1">1.</span>
                  <span>
                    <strong className="text-white">Pixel visitors</strong> are processed daily at 9am UTC
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-jsb-pink mt-1">2.</span>
                  <span>
                    <strong className="text-white">Intent data</strong> is scored and top leads are processed daily at 10am UTC
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-jsb-pink mt-1">3.</span>
                  <span>
                    <strong className="text-white">Apollo searches</strong> can be run manually or scheduled daily at 11am UTC
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-jsb-pink mt-1">4.</span>
                  <span>
                    All leads flow through the same qualification and research pipeline
                  </span>
                </li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </Shell>
  )
}
