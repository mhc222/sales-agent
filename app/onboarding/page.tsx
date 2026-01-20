'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { jsb, cn } from '@/lib/styles'
import LLMProviderStep from '@/components/onboarding/LLMProviderStep'
import CompanyStep from '@/components/onboarding/CompanyStep'
import ICPStep from '@/components/onboarding/ICPStep'
import ChannelsStep from '@/components/onboarding/ChannelsStep'
import EmailProviderStep from '@/components/onboarding/EmailProviderStep'
import LinkedInStep from '@/components/onboarding/LinkedInStep'
import CRMStep from '@/components/onboarding/CRMStep'
import DNCStep from '@/components/onboarding/DNCStep'
// Note: ApolloStep and AudienceLabStep removed - data sources are now campaign-level

import type { LLMProvider } from '@/src/lib/llm/types'

import type {
  AccountCriteria,
  ICPPersona,
  ICPTrigger,
} from '@/src/lib/tenant-settings'


type OnboardingData = {
  llm: {
    provider: LLMProvider | ''
    apiKey: string
    model?: string
  }
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
    // Note: dataSources removed - now configured at campaign level
  }
  emailProvider: {
    provider: 'smartlead' | 'nureply' | 'instantly' | ''
    apiKey: string
    campaignId: string
  }
  // Note: apollo and audienceLab removed - data sources are now campaign-level
  linkedIn: {
    provider: 'heyreach' | ''
    apiKey: string
    skip: boolean
  }
  crm: {
    provider: 'gohighlevel' | ''
    apiKey: string
    locationId: string
    skip: boolean
  }
  dnc: {
    entries: Array<{ type: 'email' | 'domain'; value: string }>
    skip: boolean
  }
}

// Steps are dynamically computed based on channel selections
// Note: Apollo and AudienceLab steps removed - data sources are now campaign-level
// Order: AI Provider (needed for ICP research) → Company → ICP → Channels → Integrations → DNC
const getSteps = (channels: OnboardingData['channels']) => {
  const baseSteps = [
    { id: 'llm', title: 'AI Provider' },
    { id: 'company', title: 'Company' },
    { id: 'icp', title: 'ICP' },
    { id: 'channels', title: 'Channels' },
  ]

  // Safely access arrays with fallback to empty arrays
  const outreachChannels = channels?.outreachChannels || []

  // Add email provider step if email channel selected (SmartLead account)
  if (outreachChannels.includes('email')) {
    baseSteps.push({ id: 'email', title: 'Email Provider' })
  }

  // Add LinkedIn step if linkedin channel selected (HeyReach account)
  if (outreachChannels.includes('linkedin')) {
    baseSteps.push({ id: 'linkedin', title: 'LinkedIn' })
  }

  // Always add CRM step (optional integration)
  baseSteps.push({ id: 'crm', title: 'CRM' })

  // Always end with DNC
  baseSteps.push({ id: 'dnc', title: 'Do Not Contact' })

  return baseSteps
}

const defaultData: OnboardingData = {
  llm: { provider: '', apiKey: '' },
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
    // Note: dataSources removed - now configured at campaign level
  },
  emailProvider: { provider: '', apiKey: '', campaignId: '' },
  // Note: apollo and audienceLab removed - data sources are now campaign-level
  linkedIn: { provider: '', apiKey: '', skip: false },
  crm: { provider: '', apiKey: '', locationId: '', skip: false },
  dnc: { entries: [], skip: false },
}

export default function OnboardingPage() {
  const [currentStep, setCurrentStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const [data, setData] = useState<OnboardingData>(defaultData)

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

      // Redirect to campaign creation - data sources are now campaign-level
      router.push('/campaigns/new')
      router.refresh()
    } catch (err) {
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  const goNext = () => {
    setCurrentStep((s) => Math.min(s + 1, steps.length - 1))
  }

  const goBack = () => {
    setCurrentStep((s) => Math.max(s - 1, 0))
  }

  const updateData = (updates: Partial<OnboardingData>) => {
    setData({ ...data, ...updates })
  }

  return (
    <div>
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
        {currentStepId === 'llm' && (
          <LLMProviderStep
            data={data.llm}
            onChange={(llm) => updateData({ llm })}
            onNext={goNext}
            onBack={goBack}
          />
        )}

        {currentStepId === 'company' && (
          <CompanyStep
            data={data.company}
            onChange={(company) => updateData({ company })}
            onNext={goNext}
            onBack={goBack}
          />
        )}

        {currentStepId === 'icp' && (
          <ICPStep
            data={data.icp}
            websiteUrl={data.company.websiteUrl}
            companyName={data.company.companyName}
            llmConfig={data.llm}
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

        {/* Note: ApolloStep removed - data sources are now campaign-level */}

        {currentStepId === 'email' && (
          <EmailProviderStep
            data={data.emailProvider}
            onChange={(emailProvider) => updateData({ emailProvider })}
            onNext={goNext}
            onBack={goBack}
          />
        )}

        {/* Note: AudienceLabStep removed - data sources are now campaign-level */}

        {currentStepId === 'linkedin' && (
          <LinkedInStep
            data={data.linkedIn}
            onChange={(linkedIn) => updateData({ linkedIn })}
            onNext={goNext}
            onBack={goBack}
          />
        )}

        {currentStepId === 'crm' && (
          <CRMStep
            data={data.crm}
            onChange={(crm) => updateData({ crm })}
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
