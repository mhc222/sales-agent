'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Shell } from '@/components/layout/Shell'
import { jsb, cn } from '@/lib/styles'
import DataSourceStep, { type DataSourceData } from '@/components/campaigns/wizard/DataSourceStep'
import ChannelsStep, { type ChannelData } from '@/components/campaigns/wizard/ChannelsStep'
import type { Brand } from '@/src/lib/brands'
import type { TenantICP } from '@/src/lib/tenant-settings'
import type { CampaignMode } from '@/src/lib/orchestration/types'

// Steps in the wizard
const STEPS = ['basics', 'dataSource', 'channels', 'review'] as const
type Step = (typeof STEPS)[number]

const stepLabels: Record<Step, string> = {
  basics: 'Basics',
  dataSource: 'Data Source',
  channels: 'Channels',
  review: 'Review',
}

interface TenantConfig {
  hasSmartlead: boolean
  hasHeyreach: boolean
}

export default function NewCampaignPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState<Step>('basics')
  const [brands, setBrands] = useState<Brand[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tenantConfig, setTenantConfig] = useState<TenantConfig>({
    hasSmartlead: false,
    hasHeyreach: false,
  })

  // Form state - Basics
  const [brandId, setBrandId] = useState('')
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [customInstructions, setCustomInstructions] = useState('')
  const [targetPersona, setTargetPersona] = useState('')
  const [primaryAngle, setPrimaryAngle] = useState('')
  const [emailCount, setEmailCount] = useState(7)
  const [linkedinCount, setLinkedinCount] = useState(4)
  const [linkedinFirst, setLinkedinFirst] = useState(false)
  const [waitForConnection, setWaitForConnection] = useState(true)
  const [connectionTimeoutHours, setConnectionTimeoutHours] = useState(72)

  // Form state - Data Source
  const [dataSource, setDataSource] = useState<DataSourceData>({
    type: '',
    config: {},
    autoIngest: false,
  })

  // Form state - Channels
  const [channels, setChannels] = useState<ChannelData>({
    channels: ['email'],
    smartleadCampaignId: '',
    heyreachCampaignId: '',
  })

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      // Fetch brands and tenant config in parallel
      const [brandsRes, settingsRes] = await Promise.all([
        fetch('/api/brands'),
        fetch('/api/settings'),
      ])

      const brandsData = await brandsRes.json()
      const settingsData = await settingsRes.json()

      if (brandsRes.ok) {
        console.log('[Campaign New] Brands fetched:', brandsData.brands?.length)
        setBrands(brandsData.brands || [])
        if (brandsData.brands?.length > 0) {
          setBrandId(brandsData.brands[0].id)
          setSelectedBrand(brandsData.brands[0])
        }
      } else {
        console.error('[Campaign New] Brands fetch failed:', brandsData)
        setError(`Failed to load brands: ${brandsData.error || 'Unknown error'}`)
      }

      if (settingsRes.ok && settingsData.settings) {
        const integrations = settingsData.settings.integrations || {}
        setTenantConfig({
          hasSmartlead: !!integrations.smartlead?.api_key,
          hasHeyreach: !!integrations.heyreach?.api_key,
        })
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

  const handleSubmit = async () => {
    setError(null)
    setSubmitting(true)

    try {
      // Derive mode from channel selection
      const derivedMode: CampaignMode =
        channels.channels.includes('email') && channels.channels.includes('linkedin')
          ? 'multi_channel'
          : channels.channels.includes('linkedin')
          ? 'linkedin_only'
          : 'email_only'

      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand_id: brandId,
          name,
          description: description || undefined,
          mode: derivedMode,
          custom_instructions: customInstructions || undefined,
          target_persona: targetPersona || undefined,
          primary_angle: primaryAngle || undefined,
          email_count: emailCount,
          linkedin_count: linkedinCount,
          linkedin_first: linkedinFirst,
          wait_for_connection: waitForConnection,
          connection_timeout_hours: connectionTimeoutHours,
          smartlead_campaign_id: channels.smartleadCampaignId || undefined,
          heyreach_campaign_id: channels.heyreachCampaignId || undefined,
          // New data source fields
          data_source_type: dataSource.type || undefined,
          data_source_config: dataSource.config,
          auto_ingest: dataSource.autoIngest,
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
            <p className={jsb.subheading}>Create a new outreach campaign</p>
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
          {/* Step 1: Basics */}
          {currentStep === 'basics' && (
            <div className="space-y-6">
              <div>
                <h2 className={cn(jsb.heading, 'text-xl mb-2')}>Campaign Basics</h2>
                <p className="text-gray-400">Name your campaign and select a brand</p>
              </div>

              {/* Brand Selection */}
              <div>
                <label className={cn(jsb.label, 'block mb-2')}>Brand *</label>
                <select
                  value={brandId}
                  onChange={(e) => handleBrandChange(e.target.value)}
                  className={cn(jsb.select, 'w-full px-3 py-2')}
                  required
                >
                  {brands.map((brand) => (
                    <option key={brand.id} value={brand.id}>
                      {brand.name}
                    </option>
                  ))}
                </select>

                {/* Show inherited ICP */}
                {selectedBrand?.icp && (
                  <div className={cn(jsb.card, 'p-3 mt-3 bg-emerald-500/10 border-emerald-500/30')}>
                    <div className="flex items-center gap-2 text-emerald-400 text-sm">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      ICP inherited from brand
                      {selectedBrand.icp.personas?.length && (
                        <span className="text-gray-400">({selectedBrand.icp.personas.length} personas)</span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Campaign Name */}
              <div>
                <label className={cn(jsb.label, 'block mb-2')}>Campaign Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={cn(jsb.input, 'w-full px-4 py-3')}
                  placeholder="e.g., Q1 SaaS Outreach"
                  required
                />
              </div>

              {/* Description */}
              <div>
                <label className={cn(jsb.label, 'block mb-2')}>Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className={cn(jsb.input, 'w-full px-4 py-3')}
                  rows={2}
                  placeholder="Brief description of this campaign"
                />
              </div>

              {/* Targeting */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={cn(jsb.label, 'block mb-2')}>Target Persona</label>
                  <input
                    type="text"
                    value={targetPersona}
                    onChange={(e) => setTargetPersona(e.target.value)}
                    className={cn(jsb.input, 'w-full px-4 py-3')}
                    placeholder="e.g., VP of Marketing"
                  />
                </div>
                <div>
                  <label className={cn(jsb.label, 'block mb-2')}>Primary Angle</label>
                  <input
                    type="text"
                    value={primaryAngle}
                    onChange={(e) => setPrimaryAngle(e.target.value)}
                    className={cn(jsb.input, 'w-full px-4 py-3')}
                    placeholder="e.g., Cost reduction"
                  />
                </div>
              </div>

              {/* Custom Instructions */}
              <div>
                <label className={cn(jsb.label, 'block mb-2')}>Custom Instructions</label>
                <textarea
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  className={cn(jsb.input, 'w-full px-4 py-3')}
                  rows={3}
                  placeholder="e.g., Focus on ROI messaging. Keep emails under 100 words."
                />
                <p className="text-xs text-gray-500 mt-1">
                  These override brand-level defaults for AI generation
                </p>
              </div>

              {/* Navigation */}
              <div className="flex gap-3 pt-4">
                <Link href="/campaigns" className={cn(jsb.buttonSecondary, 'px-6 py-3')}>
                  Cancel
                </Link>
                <button
                  onClick={goNext}
                  disabled={!isBasicsValid}
                  className={cn(jsb.buttonPrimary, 'flex-1 py-3')}
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Data Source */}
          {currentStep === 'dataSource' && (
            <DataSourceStep
              data={dataSource}
              brandIcp={selectedBrand?.icp as TenantICP | null}
              onChange={setDataSource}
              onNext={goNext}
              onBack={goBack}
            />
          )}

          {/* Step 3: Channels */}
          {currentStep === 'channels' && (
            <ChannelsStep
              data={channels}
              hasSmartlead={tenantConfig.hasSmartlead}
              hasHeyreach={tenantConfig.hasHeyreach}
              onChange={setChannels}
              onNext={goNext}
              onBack={goBack}
            />
          )}

          {/* Step 4: Review */}
          {currentStep === 'review' && (
            <div className="space-y-6">
              <div>
                <h2 className={cn(jsb.heading, 'text-xl mb-2')}>Review Campaign</h2>
                <p className="text-gray-400">Confirm your campaign settings before creating</p>
              </div>

              {/* Summary Cards */}
              <div className="space-y-4">
                {/* Basics Summary */}
                <div className={cn(jsb.card, 'p-4 bg-jsb-navy-lighter/50')}>
                  <h3 className={cn(jsb.heading, 'text-sm mb-3 flex items-center gap-2')}>
                    <span className="w-6 h-6 rounded-full bg-jsb-pink/20 text-jsb-pink flex items-center justify-center text-xs">1</span>
                    Basics
                  </h3>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <dt className="text-gray-500">Name:</dt>
                    <dd className="text-white">{name}</dd>
                    <dt className="text-gray-500">Brand:</dt>
                    <dd className="text-white">{selectedBrand?.name}</dd>
                    {targetPersona && (
                      <>
                        <dt className="text-gray-500">Target:</dt>
                        <dd className="text-white">{targetPersona}</dd>
                      </>
                    )}
                    {primaryAngle && (
                      <>
                        <dt className="text-gray-500">Angle:</dt>
                        <dd className="text-white">{primaryAngle}</dd>
                      </>
                    )}
                  </dl>
                </div>

                {/* Data Source Summary */}
                <div className={cn(jsb.card, 'p-4 bg-jsb-navy-lighter/50')}>
                  <h3 className={cn(jsb.heading, 'text-sm mb-3 flex items-center gap-2')}>
                    <span className="w-6 h-6 rounded-full bg-jsb-pink/20 text-jsb-pink flex items-center justify-center text-xs">2</span>
                    Data Source
                  </h3>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <dt className="text-gray-500">Type:</dt>
                    <dd className="text-white capitalize">{dataSource.type || 'Not selected'}</dd>
                    <dt className="text-gray-500">Auto-ingest:</dt>
                    <dd className="text-white">{dataSource.autoIngest ? 'Enabled' : 'Disabled'}</dd>
                  </dl>
                </div>

                {/* Channels Summary */}
                <div className={cn(jsb.card, 'p-4 bg-jsb-navy-lighter/50')}>
                  <h3 className={cn(jsb.heading, 'text-sm mb-3 flex items-center gap-2')}>
                    <span className="w-6 h-6 rounded-full bg-jsb-pink/20 text-jsb-pink flex items-center justify-center text-xs">3</span>
                    Channels
                  </h3>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <dt className="text-gray-500">Channels:</dt>
                    <dd className="text-white">
                      {channels.channels.map((c) => (c === 'email' ? 'Email' : 'LinkedIn')).join(', ')}
                    </dd>
                    {channels.channels.includes('email') && channels.smartleadCampaignId && (
                      <>
                        <dt className="text-gray-500">SmartLead ID:</dt>
                        <dd className="text-white">{channels.smartleadCampaignId}</dd>
                      </>
                    )}
                    {channels.channels.includes('linkedin') && channels.heyreachCampaignId && (
                      <>
                        <dt className="text-gray-500">HeyReach ID:</dt>
                        <dd className="text-white">{channels.heyreachCampaignId}</dd>
                      </>
                    )}
                  </dl>
                </div>
              </div>

              {/* Navigation */}
              <div className="flex gap-3 pt-4">
                <button onClick={goBack} className={cn(jsb.buttonSecondary, 'px-6 py-3')}>
                  Back
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className={cn(jsb.buttonPrimary, 'flex-1 py-3')}
                >
                  {submitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Creating...
                    </span>
                  ) : (
                    'Create Campaign'
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Shell>
  )
}
