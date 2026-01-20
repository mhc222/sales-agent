'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Shell } from '@/components/layout/Shell'
import { jsb, cn } from '@/lib/styles'
import DataSourceStep, { type DataSourceData } from '@/components/campaigns/wizard/DataSourceStep'
import type { Brand } from '@/src/lib/brands'
import type { ICPPersona } from '@/src/lib/tenant-settings'
import type { CampaignMode } from '@/src/lib/orchestration/types'

// Simplified steps - no channels (inherited from brand)
const STEPS = ['basics', 'intent', 'dataSource', 'review'] as const
type Step = (typeof STEPS)[number]

const stepLabels: Record<Step, string> = {
  basics: 'Campaign Details',
  intent: 'Campaign Focus',
  dataSource: 'Data Source',
  review: 'Review & Create',
}

export default function NewCampaignPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [currentStep, setCurrentStep] = useState<Step>('basics')
  const [brands, setBrands] = useState<Brand[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state - Basics
  const [brandId, setBrandId] = useState('')
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  // Form state - Intent/Targeting
  const [targetPersona, setTargetPersona] = useState('')
  const [primaryAngle, setPrimaryAngle] = useState('')
  const [customInstructions, setCustomInstructions] = useState('')

  // Form state - Data Source
  const [dataSource, setDataSource] = useState<DataSourceData>({
    type: '',
    config: {},
    autoIngest: false,
  })

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

        // Check if brand is pre-selected from query params
        const preSelectedBrandId = searchParams.get('brand')
        if (preSelectedBrandId && data.brands?.find((b: Brand) => b.id === preSelectedBrandId)) {
          setBrandId(preSelectedBrandId)
          setSelectedBrand(data.brands.find((b: Brand) => b.id === preSelectedBrandId))
        } else if (data.brands?.length > 0) {
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
    // Reset persona selection when brand changes
    setTargetPersona('')
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
  const isIntentValid = true // Optional fields
  const isDataSourceValid = dataSource.type !== ''

  const canProceed = () => {
    switch (currentStep) {
      case 'basics':
        return isBasicsValid
      case 'intent':
        return isIntentValid
      case 'dataSource':
        return isDataSourceValid
      default:
        return true
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
          description: description || undefined,
          mode: derivedMode,
          custom_instructions: customInstructions || undefined,
          target_persona: targetPersona || undefined,
          primary_angle: primaryAngle || undefined,
          // Channels and integrations inherited from brand
          // Data source configuration
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

          {/* Step 2: Campaign Intent/Focus */}
          {currentStep === 'intent' && (
            <div className="space-y-6">
              <div>
                <h2 className={cn(jsb.heading, 'text-xl mb-2')}>Campaign Focus</h2>
                <p className={jsb.subheading}>
                  Define the targeting and messaging for this campaign
                </p>
              </div>

              {/* Target Persona */}
              <div>
                <label htmlFor="targetPersona" className={cn(jsb.label, 'block mb-2')}>
                  Target Persona <span className="text-gray-500 text-xs">(optional)</span>
                </label>
                {selectedBrand?.icp?.personas && selectedBrand.icp.personas.length > 0 ? (
                  <select
                    id="targetPersona"
                    value={targetPersona}
                    onChange={(e) => setTargetPersona(e.target.value)}
                    className={cn(jsb.input, 'w-full px-4 py-3')}
                  >
                    <option value="">All personas</option>
                    {selectedBrand.icp.personas.map((persona: ICPPersona, index: number) => (
                      <option key={index} value={persona.job_title}>
                        {persona.job_title}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id="targetPersona"
                    type="text"
                    value={targetPersona}
                    onChange={(e) => setTargetPersona(e.target.value)}
                    placeholder="e.g., CFOs at mid-market companies"
                    className={cn(jsb.input, 'w-full px-4 py-3')}
                  />
                )}
                <p className="text-xs text-gray-500 mt-1">
                  Who specifically are you targeting in this campaign?
                </p>
              </div>

              {/* Primary Angle */}
              <div>
                <label htmlFor="primaryAngle" className={cn(jsb.label, 'block mb-2')}>
                  Primary Messaging Angle <span className="text-gray-500 text-xs">(optional)</span>
                </label>
                <textarea
                  id="primaryAngle"
                  value={primaryAngle}
                  onChange={(e) => setPrimaryAngle(e.target.value)}
                  placeholder="e.g., Cost reduction through automation, Security compliance for healthcare, etc."
                  rows={3}
                  className={cn(jsb.input, 'w-full px-4 py-3 resize-y')}
                />
                <p className="text-xs text-gray-500 mt-1">
                  What's the main value proposition or angle for this campaign?
                </p>
              </div>

              {/* Custom Instructions */}
              <div>
                <label htmlFor="customInstructions" className={cn(jsb.label, 'block mb-2')}>
                  Custom Instructions <span className="text-gray-500 text-xs">(optional)</span>
                </label>
                <textarea
                  id="customInstructions"
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  placeholder="Any specific instructions for AI-generated content in this campaign..."
                  rows={4}
                  className={cn(jsb.input, 'w-full px-4 py-3 resize-y')}
                />
              </div>
            </div>
          )}

          {/* Step 3: Data Source */}
          {currentStep === 'dataSource' && (
            <DataSourceStep
              data={dataSource}
              onChange={setDataSource}
              onNext={goNext}
              onBack={goBack}
              hideNavigation={true}
            />
          )}

          {/* Step 4: Review */}
          {currentStep === 'review' && (
            <div className="space-y-6">
              <div>
                <h2 className={cn(jsb.heading, 'text-xl mb-2')}>Review & Create</h2>
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

                {/* Intent/Focus */}
                <div className={cn(jsb.card, 'p-4 bg-jsb-navy-lighter/50')}>
                  <h3 className="text-sm font-medium text-gray-400 mb-3">Campaign Focus</h3>
                  <div className="space-y-2">
                    {targetPersona && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Target Persona:</span>
                        <span className="text-white">{targetPersona}</span>
                      </div>
                    )}
                    {primaryAngle && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Primary Angle:</span>
                        <span className="text-white text-sm">{primaryAngle}</span>
                      </div>
                    )}
                    {!targetPersona && !primaryAngle && (
                      <p className="text-gray-500 text-sm">Using brand defaults</p>
                    )}
                  </div>
                </div>

                {/* Data Source */}
                <div className={cn(jsb.card, 'p-4 bg-jsb-navy-lighter/50')}>
                  <h3 className="text-sm font-medium text-gray-400 mb-3">Data Source</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Type:</span>
                      <span className="text-white capitalize">{dataSource.type}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Auto-ingest:</span>
                      <span className="text-white">{dataSource.autoIngest ? 'Enabled' : 'Disabled'}</span>
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
