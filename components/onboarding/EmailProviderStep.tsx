'use client'

import { useState } from 'react'
import { jsb, cn } from '@/lib/styles'

type EmailProviderData = {
  provider: 'smartlead' | 'nureply' | 'instantly' | ''
  apiKey: string
  campaignId: string
}

type Props = {
  data: EmailProviderData
  onChange: (data: EmailProviderData) => void
  onNext: () => void
  onBack: () => void
}

const providers = [
  {
    id: 'smartlead' as const,
    name: 'Smartlead',
    description: 'AI-powered cold email platform with real-time webhooks',
    logo: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
      </svg>
    ),
  },
  {
    id: 'nureply' as const,
    name: 'Nureply',
    description: 'Cold email with built-in warmup & DNC',
    logo: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
      </svg>
    ),
  },
  {
    id: 'instantly' as const,
    name: 'Instantly',
    description: 'Cold email outreach at scale',
    logo: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
        <circle cx="12" cy="12" r="10" />
      </svg>
    ),
  },
]

export default function EmailProviderStep({ data, onChange, onNext, onBack }: Props) {
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  const isValid = data.provider && data.apiKey.trim()

  const testConnection = async () => {
    setTesting(true)
    setTestResult(null)

    try {
      const res = await fetch('/api/onboarding/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: data.provider,
          apiKey: data.apiKey,
        }),
      })

      const result = await res.json()
      setTestResult({
        success: result.success,
        message: result.success ? 'Connection successful!' : result.error || 'Connection failed',
      })
    } catch (err) {
      setTestResult({ success: false, message: 'Failed to test connection' })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className={cn(jsb.heading, 'text-xl mb-2')}>Connect your email provider</h2>
        <p className="text-gray-400">Select your cold email platform to send outreach</p>
      </div>

      {/* Provider Selection */}
      <div className="grid grid-cols-2 gap-4">
        {providers.map((provider) => (
          <button
            key={provider.id}
            onClick={() => onChange({ ...data, provider: provider.id })}
            className={cn(
              jsb.card,
              'p-4 text-left transition-all duration-150',
              data.provider === provider.id
                ? 'ring-2 ring-jsb-pink border-jsb-pink'
                : 'hover:border-jsb-navy-lighter'
            )}
          >
            <div className="flex items-start gap-3">
              <div className={cn(
                'w-10 h-10 rounded-lg flex items-center justify-center',
                data.provider === provider.id ? 'bg-jsb-pink/20 text-jsb-pink' : 'bg-jsb-navy-lighter text-gray-400'
              )}>
                {provider.logo}
              </div>
              <div>
                <p className={cn(jsb.heading, 'text-sm')}>{provider.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">{provider.description}</p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* API Key Input */}
      {data.provider && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div>
            <label htmlFor="apiKey" className={cn(jsb.label, 'block mb-2')}>
              {data.provider === 'smartlead' ? 'Smartlead' : data.provider === 'nureply' ? 'Nureply' : 'Instantly'} API Key
            </label>
            <input
              id="apiKey"
              type="password"
              value={data.apiKey}
              onChange={(e) => onChange({ ...data, apiKey: e.target.value })}
              className={cn(jsb.input, 'w-full px-4 py-3')}
              placeholder="Enter your API key"
            />
            <p className="text-xs text-gray-500 mt-1.5">
              Find this in your {data.provider === 'smartlead' ? 'Smartlead' : data.provider === 'nureply' ? 'Nureply' : 'Instantly'} dashboard under Settings &gt; API
            </p>
          </div>

          {(data.provider === 'smartlead' || data.provider === 'nureply') && (
            <div>
              <label htmlFor="campaignId" className={cn(jsb.label, 'block mb-2')}>
                Default Campaign ID <span className="text-gray-500">(optional)</span>
              </label>
              <input
                id="campaignId"
                type="text"
                value={data.campaignId}
                onChange={(e) => onChange({ ...data, campaignId: e.target.value })}
                className={cn(jsb.input, 'w-full px-4 py-3')}
                placeholder="e.g., 12345"
              />
            </div>
          )}

          {/* Test Connection Button */}
          <div className="flex items-center gap-4">
            <button
              onClick={testConnection}
              disabled={!data.apiKey.trim() || testing}
              className={cn(jsb.buttonSecondary, 'px-4 py-2')}
            >
              {testing ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Testing...
                </span>
              ) : (
                'Test connection'
              )}
            </button>

            {testResult && (
              <span className={cn('text-sm', testResult.success ? 'text-emerald-400' : 'text-red-400')}>
                {testResult.message}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex gap-3 pt-4">
        <button
          onClick={onBack}
          className={cn(jsb.buttonSecondary, 'px-6 py-3')}
        >
          Back
        </button>
        <button
          onClick={onNext}
          disabled={!isValid}
          className={cn(jsb.buttonPrimary, 'flex-1 py-3')}
        >
          Continue
        </button>
      </div>
    </div>
  )
}
