'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Shell } from '@/components/layout/Shell'
import { jsb, cn } from '@/lib/styles'
import type { Brand } from '@/src/lib/brands'
import type { CampaignMode } from '@/src/lib/orchestration/types'

// Simplified steps - just audience and intent signals
const STEPS = ['basics', 'audience', 'review'] as const
type Step = (typeof STEPS)[number]

const stepLabels: Record<Step, string> = {
  basics: 'Campaign Name',
  audience: 'Audience & Intent Signals',
  review: 'Review & Launch',
}

export default function NewCampaignPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState<Step>('basics')
  const [brands, setBrands] = useState<Brand[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [brandId, setBrandId] = useState('')
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  // Audience & Intent Signals
  const [audienceDescription, setAudienceDescription] = useState('')
  const [intentSignalsText, setIntentSignalsText] = useState('')
  const [dataSourceType, setDataSourceType] = useState<'intent' | 'pixel' | 'apollo' | 'csv' | 'manual'>('intent')
  const [dataSourceConfig, setDataSourceConfig] = useState<{
    api_url?: string
    api_key?: string
    saved_search_id?: string
    file?: File
  }>({})

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const res = await fetch('/api/brands')
      const data = await res.json()

      if (res.ok) {
        console.log('[Campaign New] Brands fetched:', data.brands?.length)
        setBrands(data.brands || [])

        // Auto-select first brand
        if (data.brands?.length > 0) {
          setBrandId(data.brands[0].id)
          setSelectedBrand(data.brands[0])
        }
      } else {
        console.error('[Campaign New] Brands fetch failed:', data)
        setError(`Failed to load brands: ${data.error || 'Unknown error'}`)
      }
    } catch (err) {
      console.error('Failed to load data:', err)
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const handleBrandChange = useCallback((newBrandId: string) => {
    setBrandId(newBrandId)
    const brand = brands.find((b) => b.id === newBrandId) || null
    setSelectedBrand(brand)
  }, [brands])

  // Navigation
  const currentStepIndex = STEPS.indexOf(currentStep)
  const canGoBack = currentStepIndex > 0
  const canGoNext = currentStepIndex < STEPS.length - 1

  const goBack = () => {
    if (canGoBack) {
      setCurrentStep(STEPS[currentStepIndex - 1])
    }
  }

  const goNext = () => {
    if (canGoNext) {
      setCurrentStep(STEPS[currentStepIndex + 1])
    }
  }

  // Validation for each step
  const isBasicsValid = brandId && name.trim()

  // Validate credentials based on data source type
  const hasValidCredentials = () => {
    switch (dataSourceType) {
      case 'intent':
      case 'pixel':
        return !!(dataSourceConfig.api_url && dataSourceConfig.api_key)
      case 'apollo':
        return !!dataSourceConfig.api_key
      case 'csv':
        return !!dataSourceConfig.file
      case 'manual':
        return true
      default:
        return false
    }
  }

  const isAudienceValid = audienceDescription.trim() && intentSignalsText.trim() && hasValidCredentials()

  const canProceed = () => {
    switch (currentStep) {
      case 'basics':
        return isBasicsValid
      case 'audience':
        return isAudienceValid
      default:
        return true
    }
  }

  const prepareDataSourceConfig = () => {
    switch (dataSourceType) {
      case 'intent':
      case 'pixel':
        return {
          api_url: dataSourceConfig.api_url,
          api_key: dataSourceConfig.api_key,
        }
      case 'apollo':
        return {
          api_key: dataSourceConfig.api_key,
          ...(dataSourceConfig.saved_search_id && {
            saved_search_id: dataSourceConfig.saved_search_id
          }),
        }
      case 'csv':
      case 'manual':
        return {}
      default:
        return {}
    }
  }

  const handleSubmit = async () => {
    setError(null)
    setSubmitting(true)

    try {
      // Derive mode from brand's enabled channels
      const brandChannels = selectedBrand?.settings?.enabled_channels || ['email']
      const derivedMode: CampaignMode =
        brandChannels.includes('email') && brandChannels.includes('linkedin')
          ? 'multi_channel'
          : brandChannels.includes('linkedin')
          ? 'linkedin_only'
          : 'email_only'

      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand_id: brandId,
          name,
          mode: derivedMode,
          // Audience & Intent Signals
          target_persona: audienceDescription,
          primary_angle: intentSignalsText.trim(),
          // Data source configuration
          data_source_type: dataSourceType,
          data_source_config: prepareDataSourceConfig(),
          auto_ingest: dataSourceType === 'intent' || dataSourceType === 'pixel',
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to create campaign')
        return
      }

      router.push(`/campaigns/${data.campaign.id}`)
    } catch {
      setError('Failed to create campaign')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <Shell>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-jsb-pink"></div>
        </div>
      </Shell>
    )
  }

  if (brands.length === 0) {
    return (
      <Shell>
        <div className="p-6 lg:p-8">
          <div className={cn(jsb.card, 'p-8 text-center')}>
            <svg className="w-12 h-12 text-gray-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <h3 className={cn(jsb.heading, 'text-lg mb-2')}>No brands found</h3>
            <p className={jsb.subheading}>
              {error ? (
                <>Error loading brands: {error}</>
              ) : (
                <>You need to create a brand before creating campaigns.</>
              )}
            </p>
            <div className="flex gap-3 justify-center mt-4">
              <button
                onClick={() => {
                  setLoading(true)
                  fetchData()
                }}
                className={cn(jsb.buttonGhost, 'px-6 py-2')}
              >
                Retry
              </button>
              <Link href="/brands/new" className={cn(jsb.buttonPrimary, 'px-6 py-2 inline-block')}>
                Create Brand
              </Link>
            </div>
          </div>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <div className="p-6 lg:p-8 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link href="/campaigns" className={cn(jsb.buttonGhost, 'p-2')}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </Link>
          <div>
            <h1 className={cn(jsb.heading, 'text-2xl')}>New Campaign</h1>
            <p className={jsb.subheading}>Campaigns inherit channels and integrations from their brand</p>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2">
          {STEPS.map((step, index) => {
            const isCurrent = step === currentStep
            const isPast = index < currentStepIndex
            return (
              <div key={step} className="flex items-center">
                {index > 0 && (
                  <div className={cn('w-8 h-0.5 mx-1', isPast ? 'bg-jsb-pink' : 'bg-jsb-navy-lighter')} />
                )}
                <div
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm whitespace-nowrap',
                    isCurrent
                      ? 'bg-jsb-pink/20 text-jsb-pink'
                      : isPast
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-jsb-navy-lighter text-gray-500'
                  )}
                >
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs border border-current">
                    {isPast ? (
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      index + 1
                    )}
                  </span>
                  {stepLabels[step]}
                </div>
              </div>
            )
          })}
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500/30 rounded-md p-4 text-red-400 mb-6">
            {error}
          </div>
        )}

        {/* Step Content */}
        <div className={cn(jsb.card, 'p-6')}>
          {/* Step 1: Campaign Details */}
          {currentStep === 'basics' && (
            <div className="space-y-6">
              <div>
                <h2 className={cn(jsb.heading, 'text-xl mb-2')}>Campaign Details</h2>
                <p className={jsb.subheading}>
                  Choose a brand and name your campaign
                </p>
              </div>

              {/* Brand Selection */}
              <div>
                <label htmlFor="brand" className={cn(jsb.label, 'block mb-2')}>
                  Brand <span className="text-red-400">*</span>
                </label>
                <select
                  id="brand"
                  value={brandId}
                  onChange={(e) => handleBrandChange(e.target.value)}
                  className={cn(jsb.input, 'w-full px-4 py-3')}
                >
                  {brands.map((brand) => (
                    <option key={brand.id} value={brand.id}>
                      {brand.name}
                    </option>
                  ))}
                </select>
                {selectedBrand && (
                  <p className="text-xs text-gray-500 mt-1">
                    Channels: {selectedBrand.settings?.enabled_channels?.join(', ') || 'email'}
                  </p>
                )}
              </div>

              {/* Campaign Name */}
              <div>
                <label htmlFor="name" className={cn(jsb.label, 'block mb-2')}>
                  Campaign Name <span className="text-red-400">*</span>
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Q1 2025 Outreach"
                  className={cn(jsb.input, 'w-full px-4 py-3')}
                  autoFocus
                />
              </div>

              {/* Description */}
              <div>
                <label htmlFor="description" className={cn(jsb.label, 'block mb-2')}>
                  Description <span className="text-gray-500 text-xs">(optional)</span>
                </label>
                <textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description of this campaign's goals..."
                  rows={3}
                  className={cn(jsb.input, 'w-full px-4 py-3 resize-y')}
                />
              </div>
            </div>
          )}

          {/* Step 2: Audience & Intent Signals */}
          {currentStep === 'audience' && (
            <div className="space-y-6">
              <div>
                <h2 className={cn(jsb.heading, 'text-xl mb-2')}>Audience & Intent Signals</h2>
                <p className={jsb.subheading}>
                  Define who you're targeting and what signals indicate they're ready
                </p>
              </div>

              {/* Audience Description */}
              <div>
                <label htmlFor="audienceDescription" className={cn(jsb.label, 'block mb-2')}>
                  Audience Description <span className="text-red-400">*</span>
                </label>
                <textarea
                  id="audienceDescription"
                  value={audienceDescription}
                  onChange={(e) => setAudienceDescription(e.target.value)}
                  placeholder="e.g., CFOs at mid-market SaaS companies with 100-500 employees"
                  rows={4}
                  className={cn(jsb.input, 'w-full px-4 py-3 resize-y')}
                  autoFocus
                />
                <p className="text-xs text-gray-500 mt-1">
                  Who specifically are you targeting in this campaign?
                </p>
              </div>

              {/* Data Source Type */}
              <div>
                <label className={cn(jsb.label, 'block mb-2')}>
                  Data Source Type
                </label>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {(['intent', 'pixel', 'apollo', 'csv', 'manual'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setDataSourceType(type)}
                      className={cn(
                        'px-4 py-2 rounded-md text-sm font-medium transition-colors border',
                        dataSourceType === type
                          ? 'bg-jsb-pink border-jsb-pink text-white'
                          : 'bg-jsb-navy-lighter border-jsb-navy-lighter text-gray-300 hover:bg-jsb-navy-light'
                      )}
                    >
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Apollo Credentials */}
              {dataSourceType === 'apollo' && (
                <div className={cn(jsb.card, 'p-5 space-y-4 bg-jsb-navy-lighter/50')}>
                  <h3 className={cn(jsb.heading, 'text-sm')}>Apollo Credentials</h3>

                  <div>
                    <label className={cn(jsb.label, 'block mb-2')}>
                      API Key <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="password"
                      value={dataSourceConfig.api_key || ''}
                      onChange={(e) => setDataSourceConfig({
                        ...dataSourceConfig,
                        api_key: e.target.value
                      })}
                      className={cn(jsb.input, 'w-full px-4 py-3')}
                      placeholder="Enter Apollo API key"
                    />
                  </div>

                  <div>
                    <label className={cn(jsb.label, 'block mb-2')}>
                      Saved Search ID <span className="text-gray-500 text-xs">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={dataSourceConfig.saved_search_id || ''}
                      onChange={(e) => setDataSourceConfig({
                        ...dataSourceConfig,
                        saved_search_id: e.target.value
                      })}
                      className={cn(jsb.input, 'w-full px-4 py-3')}
                      placeholder="Apollo saved search ID"
                    />
                  </div>
                </div>
              )}

              {/* AudienceLab Credentials (Intent/Pixel) */}
              {(dataSourceType === 'intent' || dataSourceType === 'pixel') && (
                <div className={cn(jsb.card, 'p-5 space-y-4 bg-jsb-navy-lighter/50')}>
                  <h3 className={cn(jsb.heading, 'text-sm')}>AudienceLab Credentials</h3>

                  <div>
                    <label className={cn(jsb.label, 'block mb-2')}>
                      API URL <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="url"
                      value={dataSourceConfig.api_url || ''}
                      onChange={(e) => setDataSourceConfig({
                        ...dataSourceConfig,
                        api_url: e.target.value
                      })}
                      className={cn(jsb.input, 'w-full px-4 py-3')}
                      placeholder="https://api.audiencelab.io/segment/..."
                    />
                  </div>

                  <div>
                    <label className={cn(jsb.label, 'block mb-2')}>
                      API Key <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="password"
                      value={dataSourceConfig.api_key || ''}
                      onChange={(e) => setDataSourceConfig({
                        ...dataSourceConfig,
                        api_key: e.target.value
                      })}
                      className={cn(jsb.input, 'w-full px-4 py-3')}
                      placeholder="Enter AudienceLab API key"
                    />
                  </div>
                </div>
              )}

              {/* CSV Upload */}
              {dataSourceType === 'csv' && (
                <div className={cn(jsb.card, 'p-5 space-y-4 bg-jsb-navy-lighter/50')}>
                  <h3 className={cn(jsb.heading, 'text-sm')}>CSV File Upload</h3>
                  <div>
                    <label className={cn(jsb.label, 'block mb-2')}>
                      Upload Lead File <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="file"
                      accept=".csv"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) setDataSourceConfig({ ...dataSourceConfig, file })
                      }}
                      className={cn(jsb.input, 'w-full px-4 py-3')}
                    />
                    {dataSourceConfig.file && (
                      <p className="text-xs text-emerald-400 mt-2">
                        Selected: {dataSourceConfig.file.name}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Intent Signals */}
              <div>
                <label htmlFor="intentSignals" className={cn(jsb.label, 'block mb-2')}>
                  Intent Signals <span className="text-red-400">*</span>
                </label>
                <p className="text-xs text-gray-500 mb-3">
                  What signals indicate this prospect is ready? Paste multiple signals, one per line.
                </p>
                <textarea
                  id="intentSignals"
                  value={intentSignalsText}
                  onChange={(e) => setIntentSignalsText(e.target.value)}
                  placeholder={`Visited pricing page\nDownloaded whitepaper\nRecent funding announcement\nJob posting for relevant role\nAttended webinar`}
                  rows={8}
                  className={cn(jsb.input, 'w-full px-4 py-3 resize-y font-mono text-sm')}
                />
                <p className="text-xs text-gray-500 mt-1">
                  One signal per line
                </p>
              </div>
            </div>
          )}

          {/* Step 3: Review */}
          {currentStep === 'review' && (
            <div className="space-y-6">
              <div>
                <h2 className={cn(jsb.heading, 'text-xl mb-2')}>Review & Launch</h2>
                <p className={jsb.subheading}>
                  Review your campaign settings before creating
                </p>
              </div>

              {/* Summary Cards */}
              <div className="space-y-4">
                {/* Brand & Details */}
                <div className={cn(jsb.card, 'p-4 bg-jsb-navy-lighter/50')}>
                  <h3 className="text-sm font-medium text-gray-400 mb-3">Campaign Details</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Brand:</span>
                      <span className="text-white">{selectedBrand?.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Name:</span>
                      <span className="text-white">{name}</span>
                    </div>
                    {description && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Description:</span>
                        <span className="text-white text-sm">{description}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-gray-500">Channels:</span>
                      <span className="text-white capitalize">
                        {selectedBrand?.settings?.enabled_channels?.join(', ') || 'email'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Audience & Intent */}
                <div className={cn(jsb.card, 'p-4 bg-jsb-navy-lighter/50')}>
                  <h3 className="text-sm font-medium text-gray-400 mb-3">Audience & Intent Signals</h3>
                  <div className="space-y-3">
                    <div>
                      <span className="text-gray-500 text-sm">Audience:</span>
                      <p className="text-white mt-1">{audienceDescription}</p>
                    </div>
                    <div>
                      <span className="text-gray-500 text-sm">Intent Signals:</span>
                      <ul className="mt-1 space-y-1">
                        {intentSignalsText.split('\n').filter(s => s.trim()).map((signal, index) => (
                          <li key={index} className="text-white flex items-start gap-2">
                            <span className="text-jsb-pink mt-1">•</span>
                            <span>{signal}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Data Source */}
                <div className={cn(jsb.card, 'p-4 bg-jsb-navy-lighter/50')}>
                  <h3 className="text-sm font-medium text-gray-400 mb-3">Data Source</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Type:</span>
                      <span className="text-white capitalize">{dataSourceType}</span>
                    </div>

                    {/* Apollo credentials display */}
                    {dataSourceType === 'apollo' && dataSourceConfig.api_key && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-gray-500">API Key:</span>
                          <span className="text-white font-mono text-sm">
                            {'●'.repeat(12)}{dataSourceConfig.api_key.slice(-6)}
                          </span>
                        </div>
                        {dataSourceConfig.saved_search_id && (
                          <div className="flex justify-between">
                            <span className="text-gray-500">Saved Search:</span>
                            <span className="text-white">{dataSourceConfig.saved_search_id}</span>
                          </div>
                        )}
                      </>
                    )}

                    {/* AudienceLab credentials */}
                    {(dataSourceType === 'intent' || dataSourceType === 'pixel') && (
                      <>
                        <div className="flex justify-between items-start">
                          <span className="text-gray-500">API URL:</span>
                          <span className="text-white text-sm truncate max-w-[200px]">
                            {dataSourceConfig.api_url}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">API Key:</span>
                          <span className="text-white font-mono text-sm">
                            {'●'.repeat(12)}{dataSourceConfig.api_key?.slice(-6) || ''}
                          </span>
                        </div>
                      </>
                    )}

                    {/* CSV file */}
                    {dataSourceType === 'csv' && dataSourceConfig.file && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">File:</span>
                        <span className="text-white">{dataSourceConfig.file.name}</span>
                      </div>
                    )}

                    <div className="flex justify-between">
                      <span className="text-gray-500">Auto-ingest:</span>
                      <span className="text-white">
                        {dataSourceType === 'intent' || dataSourceType === 'pixel' ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex gap-3 mt-8 pt-6 border-t border-jsb-navy-lighter">
            {canGoBack && (
              <button
                onClick={goBack}
                className={cn(jsb.buttonGhost, 'px-6 py-3')}
              >
                Back
              </button>
            )}

            {currentStep === 'review' ? (
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className={cn(
                  jsb.buttonPrimary,
                  'flex-1 py-3',
                  submitting && 'opacity-50 cursor-not-allowed'
                )}
              >
                {submitting ? 'Creating Campaign...' : 'Create Campaign'}
              </button>
            ) : (
              <button
                onClick={goNext}
                disabled={!canProceed()}
                className={cn(
                  jsb.buttonPrimary,
                  'flex-1 py-3',
                  !canProceed() && 'opacity-50 cursor-not-allowed'
                )}
              >
                Continue
              </button>
            )}
          </div>
        </div>
      </div>
    </Shell>
  )
}
