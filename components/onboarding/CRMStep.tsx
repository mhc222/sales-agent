'use client'

import { useState } from 'react'
import { jsb, cn } from '@/lib/styles'

type CRMData = {
  provider: 'gohighlevel' | ''
  apiKey: string
  locationId: string
  skip: boolean
}

type Props = {
  data: CRMData
  onChange: (data: CRMData) => void
  onNext: () => void
  onBack: () => void
}

export default function CRMStep({ data, onChange, onNext, onBack }: Props) {
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  const isValid = data.skip || (data.provider && data.apiKey.trim() && data.locationId.trim())

  const testConnection = async () => {
    setTesting(true)
    setTestResult(null)

    try {
      const res = await fetch('/api/onboarding/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'gohighlevel',
          apiKey: data.apiKey,
          locationId: data.locationId,
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
    onChange({ ...data, skip: true, provider: '', apiKey: '', locationId: '' })
    onNext()
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className={cn(jsb.heading, 'text-xl mb-2')}>CRM Integration</h2>
        <p className="text-gray-400">Optional: Connect GoHighLevel to sync lead statuses and replies</p>
      </div>

      {/* GHL Info Card */}
      <div className={cn(jsb.card, 'p-4 flex items-start gap-4')}>
        <div className="w-12 h-12 bg-orange-500/20 rounded-lg flex items-center justify-center shrink-0">
          <svg className="w-6 h-6 text-orange-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        </div>
        <div>
          <p className={cn(jsb.heading, 'text-sm mb-1')}>GoHighLevel Integration</p>
          <p className="text-sm text-gray-400">
            Automatically sync lead statuses, replies, and unsubscribes to your GHL CRM. Enables deduplication and prevents contacting existing contacts.
          </p>
        </div>
      </div>

      {!data.skip && (
        <div className="space-y-4">
          {/* Select GHL */}
          <button
            onClick={() => onChange({ ...data, provider: 'gohighlevel', skip: false })}
            className={cn(
              jsb.card,
              'w-full p-4 text-left transition-all duration-150',
              data.provider === 'gohighlevel'
                ? 'ring-2 ring-jsb-pink border-jsb-pink'
                : 'hover:border-jsb-navy-lighter'
            )}
          >
            <div className="flex items-center gap-3">
              <div className={cn(
                'w-10 h-10 rounded-lg flex items-center justify-center',
                data.provider === 'gohighlevel' ? 'bg-jsb-pink/20 text-jsb-pink' : 'bg-jsb-navy-lighter text-gray-400'
              )}>
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div>
                <p className={jsb.heading}>GoHighLevel</p>
                <p className="text-xs text-gray-500">CRM and marketing automation platform</p>
              </div>
            </div>
          </button>

          {/* API Key and Location ID Inputs */}
          {data.provider && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div>
                <label htmlFor="ghlApiKey" className={cn(jsb.label, 'block mb-2')}>
                  GHL API Key
                </label>
                <input
                  id="ghlApiKey"
                  type="password"
                  value={data.apiKey}
                  onChange={(e) => onChange({ ...data, apiKey: e.target.value })}
                  className={cn(jsb.input, 'w-full px-4 py-3')}
                  placeholder="Enter your GoHighLevel API key"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Found in GHL Settings → Business Profile → API Keys
                </p>
              </div>

              <div>
                <label htmlFor="ghlLocationId" className={cn(jsb.label, 'block mb-2')}>
                  Location ID
                </label>
                <input
                  id="ghlLocationId"
                  type="text"
                  value={data.locationId}
                  onChange={(e) => onChange({ ...data, locationId: e.target.value })}
                  className={cn(jsb.input, 'w-full px-4 py-3')}
                  placeholder="Enter your GHL Location ID"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Found in GHL Settings → Business Profile → Location ID (starts with &quot;loc_&quot;)
                </p>
              </div>

              {/* Test Connection Button */}
              <div className="flex items-center gap-4">
                <button
                  onClick={testConnection}
                  disabled={!data.apiKey.trim() || !data.locationId.trim() || testing}
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

      {/* Benefits List */}
      <div className="bg-jsb-navy-lighter/50 rounded-lg p-4">
        <p className={cn(jsb.label, 'mb-3')}>With GHL integration you get:</p>
        <ul className="space-y-2 text-sm text-gray-400">
          <li className="flex items-center gap-2">
            <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Automatic contact deduplication before outreach
          </li>
          <li className="flex items-center gap-2">
            <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Reply classification synced to CRM tags
          </li>
          <li className="flex items-center gap-2">
            <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Automatic DND for unsubscribes
          </li>
          <li className="flex items-center gap-2">
            <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Interested leads tagged for follow-up
          </li>
        </ul>
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
