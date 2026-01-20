'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { jsb, cn } from '@/lib/styles'

// Brand wizard steps
import BrandInfoStep, { type BrandInfoData } from './BrandInfoStep'
import LLMProviderStep from './LLMProviderStep'
import ICPStep from './ICPStep'
import ChannelsStep from './ChannelsStep'
import EmailProviderStep from './EmailProviderStep'
import LinkedInStep from './LinkedInStep'
import CRMStep from './CRMStep'
import DNCStep from './DNCStep'

import type { LLMProvider } from '@/src/lib/llm/types'
import type { AccountCriteria, ICPPersona, ICPTrigger } from '@/src/lib/tenant-settings'

export type BrandWizardData = {
  brandInfo: BrandInfoData
  llm: {
    provider: LLMProvider | ''
    apiKey: string
    model?: string
  }
  icp: {
    accountCriteria: AccountCriteria | null
    personas: ICPPersona[]
    triggers: ICPTrigger[]
    researchStatus: 'idle' | 'loading' | 'complete' | 'error'
    researchError?: string
    marketResearch: string
    reconciled?: boolean
    changes?: Array<{ category: string; description: string; reason: string }>
  }
  channels: {
    outreachChannels: ('email' | 'linkedin')[]
  }
  emailProvider: {
    provider: 'smartlead' | 'nureply' | 'instantly' | ''
    apiKey: string
    campaignId: string
  }
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

// Dynamic step computation based on channel selection
const getSteps = (channels: BrandWizardData['channels']) => {
  const baseSteps = [
    { id: 'brandInfo', title: 'Brand Info' },
    { id: 'llm', title: 'AI Provider' },
    { id: 'icp', title: 'ICP Research' },
    { id: 'channels', title: 'Channels' },
  ]

  const outreachChannels = channels?.outreachChannels || []

  // Add email provider if email selected
  if (outreachChannels.includes('email')) {
    baseSteps.push({ id: 'email', title: 'Email Provider' })
  }

  // Add LinkedIn provider if linkedin selected
  if (outreachChannels.includes('linkedin')) {
    baseSteps.push({ id: 'linkedin', title: 'LinkedIn' })
  }

  // Always add optional CRM integration
  baseSteps.push({ id: 'crm', title: 'CRM' })

  // Always end with DNC
  baseSteps.push({ id: 'dnc', title: 'Do Not Contact' })

  return baseSteps
}

const defaultData: BrandWizardData = {
  brandInfo: { name: '', description: '', website: '' },
  llm: { provider: '', apiKey: '' },
  icp: {
    accountCriteria: null,
    personas: [],
    triggers: [],
    researchStatus: 'idle',
    marketResearch: '',
  },
  channels: {
    outreachChannels: ['email'], // Default to email
  },
  emailProvider: { provider: '', apiKey: '', campaignId: '' },
  linkedIn: { provider: '', apiKey: '', skip: false },
  crm: { provider: '', apiKey: '', locationId: '', skip: false },
  dnc: { entries: [], skip: false },
}

type Props = {
  tenantId: string
}

export default function BrandWizard({ tenantId }: Props) {
  const [currentStep, setCurrentStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const [data, setData] = useState<BrandWizardData>(defaultData)

  // Compute dynamic steps
  const steps = getSteps(data.channels)
  const currentStepId = steps[currentStep]?.id

  const handleComplete = async () => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/brands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          ...data,
        }),
      })

      const result = await res.json()

      if (!res.ok) {
        setError(result.error || 'Failed to create brand')
        return
      }

      // Redirect to brand detail page or campaigns
      router.push(`/brands/${result.brand.id}`)
      router.refresh()
    } catch {
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

  const updateData = (updates: Partial<BrandWizardData>) => {
    setData({ ...data, ...updates })
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className={cn(jsb.heading, 'text-3xl mb-2')}>Create New Brand</h1>
        <p className="text-gray-400">
          Set up your brand with AI provider, ICP research, channels, and integrations
        </p>
      </div>

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
                    <svg
                      className="w-5 h-5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
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
        {currentStepId === 'brandInfo' && (
          <BrandInfoStep
            data={data.brandInfo}
            onChange={(brandInfo) => updateData({ brandInfo })}
            onNext={goNext}
          />
        )}

        {currentStepId === 'llm' && (
          <LLMProviderStep
            data={data.llm}
            onChange={(llm) => updateData({ llm })}
            onNext={goNext}
            onBack={goBack}
          />
        )}

        {currentStepId === 'icp' && (
          <ICPStep
            data={data.icp}
            websiteUrl={data.brandInfo.website}
            companyName={data.brandInfo.name}
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

        {currentStepId === 'email' && (
          <EmailProviderStep
            data={data.emailProvider}
            onChange={(emailProvider) => updateData({ emailProvider })}
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
