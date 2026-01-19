'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { jsb, cn } from '@/lib/styles'
import CompanyStep from '@/components/onboarding/CompanyStep'
import ICPStep from '@/components/onboarding/ICPStep'
import ChannelsStep from '@/components/onboarding/ChannelsStep'
import EmailProviderStep from '@/components/onboarding/EmailProviderStep'
import ApolloStep from '@/components/onboarding/ApolloStep'
import AudienceLabStep from '@/components/onboarding/AudienceLabStep'
import LinkedInStep from '@/components/onboarding/LinkedInStep'
import DNCStep from '@/components/onboarding/DNCStep'

import type {
  AccountCriteria,
  ICPPersona,
  ICPTrigger,
} from '@/src/lib/tenant-settings'

const STORAGE_KEY = 'onboarding_progress'

type OnboardingData = {
  company: {
    companyName: string
    yourName: string
    websiteUrl: string
  }
  icp: {
    // AI-generated data
    accountCriteria: AccountCriteria | null
    personas: ICPPersona[]
    triggers: ICPTrigger[]
    // Research state
    researchStatus: 'idle' | 'loading' | 'complete' | 'error'
    researchError?: string
    // Optional market research (unstructured text)
    marketResearch: string
    // Reconciliation state
    reconciled?: boolean
    changes?: Array<{ category: string; description: string; reason: string }>
  }
  channels: {
    outreachChannels: ('email' | 'linkedin')[]
    dataSources: ('apollo' | 'audiencelab')[]
  }
  emailProvider: {
    provider: 'smartlead' | 'nureply' | 'instantly' | ''
    apiKey: string
    campaignId: string
  }
  apollo: {
    apiKey: string
  }
  audienceLab: {
    sources: Array<{
      name: string
      apiUrl: string
      apiKey: string
      type: 'pixel' | 'intent'
      enabled: boolean
      intentKeywords?: string[]
      audienceContext?: string
    }>
    skip: boolean
  }
  linkedIn: {
    provider: 'heyreach' | ''
    apiKey: string
    skip: boolean
  }
  dnc: {
    entries: Array<{ type: 'email' | 'domain'; value: string }>
    skip: boolean
  }
}

// Steps are dynamically computed based on channel selections
const getSteps = (channels: OnboardingData['channels']) => {
  const baseSteps = [
    { id: 'company', title: 'Company' },
    { id: 'icp', title: 'ICP & Messaging' },
    { id: 'channels', title: 'Channels' },
  ]

  // Add Apollo step if selected as data source
  if (channels.dataSources.includes('apollo')) {
    baseSteps.push({ id: 'apollo', title: 'Apollo' })
  }

  // Add email provider step if email channel selected
  if (channels.outreachChannels.includes('email')) {
    baseSteps.push({ id: 'email', title: 'Email Provider' })
  }

  // Add AudienceLab step if selected as data source
  if (channels.dataSources.includes('audiencelab')) {
    baseSteps.push({ id: 'audiencelab', title: 'Data Sources' })
  }

  // Add LinkedIn step if linkedin channel selected
  if (channels.outreachChannels.includes('linkedin')) {
    baseSteps.push({ id: 'linkedin', title: 'LinkedIn' })
  }

  // Always end with DNC
  baseSteps.push({ id: 'dnc', title: 'Do Not Contact' })

  return baseSteps
}

const defaultData: OnboardingData = {
  company: { companyName: '', yourName: '', websiteUrl: '' },
  icp: {
    accountCriteria: null,
    personas: [],
    triggers: [],
    researchStatus: 'idle',
    marketResearch: '',
  },
  channels: {
    outreachChannels: ['email'], // Default to email
    dataSources: ['apollo'], // Apollo is always required
  },
  emailProvider: { provider: '', apiKey: '', campaignId: '' },
  apollo: { apiKey: '' },
  audienceLab: { sources: [], skip: false },
  linkedIn: { provider: '', apiKey: '', skip: false },
  dnc: { entries: [], skip: false },
}

export default function OnboardingPage() {
  const [currentStep, setCurrentStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [restored, setRestored] = useState(false)
  const [showRestoredBanner, setShowRestoredBanner] = useState(false)
  const router = useRouter()

  const [data, setData] = useState<OnboardingData>(defaultData)

  // Restore progress from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.data && parsed.step !== undefined) {
          setData(parsed.data)
          setCurrentStep(parsed.step)
          setRestored(true)
          setShowRestoredBanner(true)
          // Hide banner after 5 seconds
          setTimeout(() => setShowRestoredBanner(false), 5000)
        }
      }
    } catch (e) {
      console.error('Failed to restore onboarding progress:', e)
    }
  }, [])

  // Save progress to localStorage whenever data or step changes
  const saveProgress = useCallback((newData: OnboardingData, step: number) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        data: newData,
        step,
        savedAt: new Date().toISOString(),
      }))
    } catch (e) {
      console.error('Failed to save onboarding progress:', e)
    }
  }, [])

  // Clear saved progress
  const clearProgress = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch (e) {
      console.error('Failed to clear onboarding progress:', e)
    }
  }, [])

  // Compute dynamic steps based on channel selections
  const steps = getSteps(data.channels)
  const currentStepId = steps[currentStep]?.id

  const handleComplete = async () => {
    setLoading(true)
    setError(null)

    try {
      // Get active tenant ID if set (for multi-brand flow)
      const activeTenantId = localStorage.getItem('active_tenant_id')

      const res = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          tenantId: activeTenantId || undefined,
        }),
      })

      const result = await res.json()

      if (!res.ok) {
        setError(result.error || 'Failed to complete setup')
        return
      }

      // Clear saved progress on successful completion
      clearProgress()

      // Redirect to account page to see all brands
      router.push('/account')
      router.refresh()
    } catch (err) {
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  const goNext = () => {
    setCurrentStep((s) => {
      const next = Math.min(s + 1, steps.length - 1)
      // Save progress when moving to next step
      saveProgress(data, next)
      return next
    })
  }

  const goBack = () => {
    setCurrentStep((s) => {
      const prev = Math.max(s - 1, 0)
      // Save progress when going back
      saveProgress(data, prev)
      return prev
    })
  }

  // Helper to update data and save progress
  const updateData = (updates: Partial<OnboardingData>) => {
    const newData = { ...data, ...updates }
    setData(newData)
    saveProgress(newData, currentStep)
  }

  return (
    <div>
      {/* Restored Progress Banner */}
      {showRestoredBanner && (
        <div className="mb-6 p-4 rounded-lg bg-jsb-pink/10 border border-jsb-pink/30 animate-fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-jsb-pink/20 flex items-center justify-center">
                <svg className="w-4 h-4 text-jsb-pink" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-white font-medium">Progress Restored</p>
                <p className="text-xs text-gray-400">We&apos;ve restored your previous onboarding progress.</p>
              </div>
            </div>
            <button
              onClick={() => {
                clearProgress()
                setData(defaultData)
                setCurrentStep(0)
                setShowRestoredBanner(false)
              }}
              className="text-xs text-gray-400 hover:text-white transition-colors px-3 py-1 rounded hover:bg-jsb-navy-lighter"
            >
              Start Over
            </button>
          </div>
        </div>
      )}

      {/* Progress Steps */}
      <div className="mb-10">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-colors duration-200',
                    index < currentStep
                      ? 'bg-jsb-pink text-white'
                      : index === currentStep
                      ? 'bg-jsb-pink/20 text-jsb-pink border-2 border-jsb-pink'
                      : 'bg-jsb-navy-lighter text-gray-500'
                  )}
                >
                  {index < currentStep ? (
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </div>
                <span
                  className={cn(
                    'text-xs mt-2 hidden sm:block',
                    index <= currentStep ? 'text-white' : 'text-gray-500'
                  )}
                >
                  {step.title}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    'w-12 sm:w-16 h-0.5 mx-2',
                    index < currentStep ? 'bg-jsb-pink' : 'bg-jsb-navy-lighter'
                  )}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/30">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Step Content */}
      <div className={cn(jsb.card, 'p-8')}>
        {currentStepId === 'company' && (
          <CompanyStep
            data={data.company}
            onChange={(company) => updateData({ company })}
            onNext={goNext}
          />
        )}

        {currentStepId === 'icp' && (
          <ICPStep
            data={data.icp}
            websiteUrl={data.company.websiteUrl}
            companyName={data.company.companyName}
            onChange={(icp) => updateData({ icp })}
            onNext={goNext}
            onBack={goBack}
          />
        )}

        {currentStepId === 'channels' && (
          <ChannelsStep
            data={data.channels}
            onChange={(channels) => updateData({ channels })}
            onNext={goNext}
            onBack={goBack}
          />
        )}

        {currentStepId === 'apollo' && (
          <ApolloStep
            data={data.apollo}
            onChange={(apollo) => updateData({ apollo })}
            onNext={goNext}
            onBack={goBack}
          />
        )}

        {currentStepId === 'email' && (
          <EmailProviderStep
            data={data.emailProvider}
            onChange={(emailProvider) => updateData({ emailProvider })}
            onNext={goNext}
            onBack={goBack}
          />
        )}

        {currentStepId === 'audiencelab' && (
          <AudienceLabStep
            data={data.audienceLab}
            onChange={(audienceLab) => updateData({ audienceLab })}
            onNext={goNext}
            onBack={goBack}
          />
        )}

        {currentStepId === 'linkedin' && (
          <LinkedInStep
            data={data.linkedIn}
            onChange={(linkedIn) => updateData({ linkedIn })}
            onNext={goNext}
            onBack={goBack}
          />
        )}

        {currentStepId === 'dnc' && (
          <DNCStep
            data={data.dnc}
            onChange={(dnc) => updateData({ dnc })}
            onComplete={handleComplete}
            onBack={goBack}
            loading={loading}
          />
        )}
      </div>
    </div>
  )
}
