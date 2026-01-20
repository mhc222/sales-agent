'use client'

import { useState } from 'react'
import { jsb, cn } from '@/lib/styles'

type LinkedInData = {
  provider: 'heyreach' | ''
  apiKey: string
  skip: boolean
}

type Props = {
  data: LinkedInData
  onChange: (data: LinkedInData) => void
  onNext: () => void
  onBack: () => void
}

export default function LinkedInStep({ data, onChange, onNext, onBack }: Props) {
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  const isValid = data.skip || (data.provider && data.apiKey.trim())

  const testConnection = async () => {
    setTesting(true)
    setTestResult(null)

    try {
      const res = await fetch('/api/onboarding/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'heyreach',
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

  const handleSkip = () => {
    onChange({ ...data, skip: true, provider: '', apiKey: '' })
    onNext()
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className={cn(jsb.heading, 'text-xl mb-2')}>LinkedIn Outreach</h2>
        <p className="text-gray-400">Optional: Connect HeyReach for multi-channel campaigns</p>
      </div>

      {/* HeyReach Info Card */}
      <div className={cn(jsb.card, 'p-4 flex items-start gap-4')}>
        <div className="w-12 h-12 bg-sky-500/20 rounded-lg flex items-center justify-center shrink-0">
          <svg className="w-6 h-6 text-sky-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z" />
            <circle cx="4" cy="4" r="2" />
          </svg>
        </div>
        <div>
          <p className={cn(jsb.heading, 'text-sm mb-1')}>HeyReach Integration</p>
          <p className="text-sm text-gray-400">
            Automate LinkedIn connection requests, messages, and profile visits alongside your email campaigns.
          </p>
        </div>
      </div>

      {!data.skip && (
        <div className="space-y-4">
          {/* Select HeyReach */}
          <button
            onClick={() => onChange({ ...data, provider: 'heyreach', skip: false })}
            className={cn(
              jsb.card,
              'w-full p-4 text-left transition-all duration-150',
              data.provider === 'heyreach'
                ? 'ring-2 ring-jsb-pink border-jsb-pink'
                : 'hover:border-jsb-navy-lighter'
            )}
          >
            <div className="flex items-center gap-3">
              <div className={cn(
                'w-10 h-10 rounded-lg flex items-center justify-center',
                data.provider === 'heyreach' ? 'bg-jsb-pink/20 text-jsb-pink' : 'bg-jsb-navy-lighter text-gray-400'
              )}>
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6z" />
                </svg>
              </div>
              <div>
                <p className={jsb.heading}>HeyReach</p>
                <p className="text-xs text-gray-500">LinkedIn automation platform</p>
              </div>
            </div>
          </button>

          {/* API Key Input */}
          {data.provider && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div>
                <label htmlFor="heyreachApiKey" className={cn(jsb.label, 'block mb-2')}>
                  HeyReach API Key
                </label>
                <input
                  id="heyreachApiKey"
                  type="password"
                  value={data.apiKey}
                  onChange={(e) => onChange({ ...data, apiKey: e.target.value })}
                  className={cn(jsb.input, 'w-full px-4 py-3')}
                  placeholder="Enter your HeyReach API key"
                />
              </div>

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
          onClick={handleSkip}
          className={cn(jsb.buttonGhost, 'px-6 py-3')}
        >
          Skip for now
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
