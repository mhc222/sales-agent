'use client'

import { useState, useEffect } from 'react'
import { Shell } from '@/components/layout/Shell'
import ProviderCard from '@/components/settings/ProviderCard'
import { jsb, cn } from '@/lib/styles'

type EmailProvider = 'smartlead' | 'nureply' | 'instantly'
type LinkedInProvider = 'heyreach'
type Provider = EmailProvider | LinkedInProvider

interface ProviderConfig {
  isActive: boolean
  isConfigured: boolean
  apiKeyMasked: string | null
  campaignId?: string
}

interface ProvidersConfig {
  emailProvider: EmailProvider | null
  linkedinProvider: LinkedInProvider | null
  providers: {
    smartlead: ProviderConfig
    nureply: ProviderConfig
    instantly: ProviderConfig
    heyreach: ProviderConfig
  }
}

// Provider metadata
const providerInfo: Record<Provider, {
  name: string
  description: string
  features: string[]
  notes?: string
  showCampaignId: boolean
}> = {
  smartlead: {
    name: 'Smartlead',
    description: 'Email sequencing with real-time webhooks',
    features: ['Real-time webhooks', 'Pause/resume leads', 'Multi-inbox rotation'],
    showCampaignId: true,
  },
  nureply: {
    name: 'Nureply',
    description: 'Email sequencing with built-in warmup',
    features: ['Built-in warmup', 'DNC management', 'AI personalization'],
    notes: 'Syncs every 15 min (no real-time webhooks)',
    showCampaignId: true,
  },
  instantly: {
    name: 'Instantly',
    description: 'Email sequencing with analytics',
    features: ['Multi-inbox rotation', 'Campaign analytics', 'Warmup pool'],
    showCampaignId: false,
  },
  heyreach: {
    name: 'HeyReach',
    description: 'LinkedIn automation platform',
    features: ['LinkedIn automation', 'Connection requests', 'Messaging sequences'],
    showCampaignId: true,
  },
}

export default function ProvidersPage() {
  const [config, setConfig] = useState<ProvidersConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchConfig()
  }, [])

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/settings/providers')
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to load configuration')
        return
      }

      setConfig(data)
    } catch (err) {
      setError('Failed to load provider configuration')
    } finally {
      setLoading(false)
    }
  }

  const handleTest = async (provider: Provider, apiKey: string) => {
    // If apiKey is empty, the server will use existing credentials from the database
    const res = await fetch('/api/settings/providers/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider,
        apiKey: apiKey || undefined,
      }),
    })

    if (!res.ok) {
      const errorData = await res.json()
      throw new Error(errorData.error || 'Test failed')
    }

    return res.json()
  }

  const handleUpdate = async (
    provider: Provider,
    data: { apiKey?: string; campaignId?: string }
  ) => {
    const res = await fetch('/api/settings/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, ...data }),
    })

    if (!res.ok) {
      const errorData = await res.json()
      throw new Error(errorData.error || 'Failed to save')
    }

    // Refresh config
    await fetchConfig()
  }

  const handleSetActive = async (provider: Provider) => {
    const res = await fetch('/api/settings/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, setActive: true }),
    })

    if (!res.ok) {
      const errorData = await res.json()
      throw new Error(errorData.error || 'Failed to set active')
    }

    // Refresh config
    await fetchConfig()
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
          <h1 className={cn(jsb.heading, 'text-2xl mb-2')}>Outreach Providers</h1>
          <p className="text-gray-400">
            Configure your email and LinkedIn delivery providers. The active provider will be used for new lead deployments.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/30">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {config && (
          <div className="space-y-8">
            {/* Email Providers Section */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className={cn(jsb.label, 'text-sm')}>Email Provider</h2>
                {config.emailProvider && (
                  <span className="text-xs text-gray-500">
                    Active: <span className="text-jsb-pink capitalize">{config.emailProvider}</span>
                  </span>
                )}
              </div>
              <div className="space-y-4">
                {(['smartlead', 'nureply', 'instantly'] as EmailProvider[]).map((provider) => {
                  const info = providerInfo[provider]
                  const providerConfig = config.providers[provider]
                  return (
                    <ProviderCard
                      key={provider}
                      provider={provider}
                      name={info.name}
                      description={info.description}
                      features={info.features}
                      notes={info.notes}
                      isActive={providerConfig.isActive}
                      isConfigured={providerConfig.isConfigured}
                      apiKeyMasked={providerConfig.apiKeyMasked}
                      campaignId={providerConfig.campaignId}
                      showCampaignId={info.showCampaignId}
                      onTest={(apiKey) => handleTest(provider, apiKey)}
                      onUpdate={(data) => handleUpdate(provider, data)}
                      onSetActive={() => handleSetActive(provider)}
                    />
                  )
                })}
              </div>
            </div>

            {/* LinkedIn Providers Section */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className={cn(jsb.label, 'text-sm')}>LinkedIn Provider</h2>
                {config.linkedinProvider && (
                  <span className="text-xs text-gray-500">
                    Active: <span className="text-jsb-pink capitalize">{config.linkedinProvider}</span>
                  </span>
                )}
              </div>
              <div className="space-y-4">
                {(['heyreach'] as LinkedInProvider[]).map((provider) => {
                  const info = providerInfo[provider]
                  const providerConfig = config.providers[provider]
                  return (
                    <ProviderCard
                      key={provider}
                      provider={provider}
                      name={info.name}
                      description={info.description}
                      features={info.features}
                      notes={info.notes}
                      isActive={providerConfig.isActive}
                      isConfigured={providerConfig.isConfigured}
                      apiKeyMasked={providerConfig.apiKeyMasked}
                      campaignId={providerConfig.campaignId}
                      showCampaignId={info.showCampaignId}
                      onTest={(apiKey) => handleTest(provider, apiKey)}
                      onUpdate={(data) => handleUpdate(provider, data)}
                      onSetActive={() => handleSetActive(provider)}
                    />
                  )
                })}
              </div>
            </div>

            {/* Info card */}
            <div className={cn(jsb.card, 'p-6')}>
              <h3 className={cn(jsb.heading, 'text-sm mb-2')}>How it works</h3>
              <ul className="text-sm text-gray-400 space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-jsb-pink mt-1">1.</span>
                  <span>
                    <strong className="text-white">Connect</strong> your provider by entering your API key and testing the connection
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-jsb-pink mt-1">2.</span>
                  <span>
                    <strong className="text-white">Set Active</strong> to designate which provider receives new lead deployments
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-jsb-pink mt-1">3.</span>
                  <span>
                    <strong className="text-white">Campaign ID</strong> is optional - if not set, leads will be added to the default campaign
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-jsb-pink mt-1">4.</span>
                  <span>
                    You can switch providers anytime - existing leads in sequences will continue with their original provider
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
