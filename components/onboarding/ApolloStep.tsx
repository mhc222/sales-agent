'use client'

import { useState } from 'react'
import { jsb, cn } from '@/lib/styles'

type ApolloData = {
  apiKey: string
}

type Props = {
  data: ApolloData
  onChange: (data: ApolloData) => void
  onNext: () => void
  onBack: () => void
}

export default function ApolloStep({ data, onChange, onNext, onBack }: Props) {
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  const isValid = data.apiKey.trim()

  const testConnection = async () => {
    setTesting(true)
    setTestResult(null)

    try {
      const res = await fetch('/api/onboarding/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'apollo',
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
        <h2 className={cn(jsb.heading, 'text-xl mb-2')}>Connect Apollo.io</h2>
        <p className="text-gray-400">Apollo provides lead data for prospecting and enrichment</p>
      </div>

      {/* Apollo Info Card */}
      <div className={cn(jsb.card, 'p-4 flex items-start gap-4')}>
        <div className="w-12 h-12 bg-violet-500/20 rounded-lg flex items-center justify-center shrink-0">
          <svg className="w-6 h-6 text-violet-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <div>
          <p className={cn(jsb.heading, 'text-sm mb-1')}>Apollo.io Integration</p>
          <p className="text-sm text-gray-400">
            Search for leads, enrich contact data, and import prospects directly into your pipeline.
          </p>
        </div>
      </div>

      {/* API Key Input */}
      <div className="space-y-4">
        <div>
          <label htmlFor="apolloApiKey" className={cn(jsb.label, 'block mb-2')}>
            Apollo API Key
          </label>
          <input
            id="apolloApiKey"
            type="password"
            value={data.apiKey}
            onChange={(e) => onChange({ ...data, apiKey: e.target.value })}
            className={cn(jsb.input, 'w-full px-4 py-3')}
            placeholder="Enter your Apollo API key"
          />
          <p className="text-xs text-gray-500 mt-1.5">
            Find this in Apollo under Settings &gt; Integrations &gt; API
          </p>
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
