'use client'

import { useState } from 'react'
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
    { id: 'apollo', title: 'Apollo' },
  ]

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

export default function OnboardingPage() {
  const [currentStep, setCurrentStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const [data, setData] = useState<OnboardingData>({
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
  })

  // Compute dynamic steps based on channel selections
  const steps = getSteps(data.channels)
  const currentStepId = steps[currentStep]?.id

  const handleComplete = async () => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      const result = await res.json()

      if (!res.ok) {
        setError(result.error || 'Failed to complete setup')
        return
      }

      // Redirect to dashboard
      router.push('/dashboard')
      router.refresh()
    } catch (err) {
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  const goNext = () => setCurrentStep((s) => Math.min(s + 1, steps.length - 1))
  const goBack = () => setCurrentStep((s) => Math.max(s - 1, 0))

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
        {currentStepId === 'company' && (
          <CompanyStep
            data={data.company}
            onChange={(company) => setData({ ...data, company })}
            onNext={goNext}
          />
        )}

        {currentStepId === 'icp' && (
          <ICPStep
            data={data.icp}
            websiteUrl={data.company.websiteUrl}
            companyName={data.company.companyName}
            onChange={(icp) => setData({ ...data, icp })}
            onNext={goNext}
            onBack={goBack}
          />
        )}

        {currentStepId === 'channels' && (
          <ChannelsStep
            data={data.channels}
            onChange={(channels) => setData({ ...data, channels })}
            onNext={goNext}
            onBack={goBack}
          />
        )}

        {currentStepId === 'apollo' && (
          <ApolloStep
            data={data.apollo}
            onChange={(apollo) => setData({ ...data, apollo })}
            onNext={goNext}
            onBack={goBack}
          />
        )}

        {currentStepId === 'email' && (
          <EmailProviderStep
            data={data.emailProvider}
            onChange={(emailProvider) => setData({ ...data, emailProvider })}
            onNext={goNext}
            onBack={goBack}
          />
        )}

        {currentStepId === 'audiencelab' && (
          <AudienceLabStep
            data={data.audienceLab}
            onChange={(audienceLab) => setData({ ...data, audienceLab })}
            onNext={goNext}
            onBack={goBack}
          />
        )}

        {currentStepId === 'linkedin' && (
          <LinkedInStep
            data={data.linkedIn}
            onChange={(linkedIn) => setData({ ...data, linkedIn })}
            onNext={goNext}
            onBack={goBack}
          />
        )}

        {currentStepId === 'dnc' && (
          <DNCStep
            data={data.dnc}
            onChange={(dnc) => setData({ ...data, dnc })}
            onComplete={handleComplete}
            onBack={goBack}
            loading={loading}
          />
        )}
      </div>
    </div>
  )
}
