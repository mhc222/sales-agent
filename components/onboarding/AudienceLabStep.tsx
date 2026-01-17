'use client'

import { useState } from 'react'
import { jsb, cn } from '@/lib/styles'

type AudienceLabSource = {
  name: string
  apiUrl: string
  apiKey: string
  type: 'pixel' | 'intent'
  enabled: boolean
  intentKeywords?: string[] // Keywords this audience is showing intent for
  audienceContext?: string // Full targeting parameters (company size, industries, titles, etc.)
}

type AudienceLabData = {
  sources: AudienceLabSource[]
  skip: boolean
}

type Props = {
  data: AudienceLabData
  onChange: (data: AudienceLabData) => void
  onNext: () => void
  onBack: () => void
}

const emptySource = (): AudienceLabSource => ({
  name: '',
  apiUrl: '',
  apiKey: '',
  type: 'pixel',
  enabled: true,
  intentKeywords: [],
  audienceContext: '',
})

export default function AudienceLabStep({ data, onChange, onNext, onBack }: Props) {
  const [testing, setTesting] = useState<number | null>(null)
  const [testResults, setTestResults] = useState<Record<number, { success: boolean; message: string }>>({})

  const addSource = () => {
    if (data.sources.length >= 5) return
    onChange({ ...data, sources: [...data.sources, emptySource()] })
  }

  const removeSource = (index: number) => {
    onChange({
      ...data,
      sources: data.sources.filter((_, i) => i !== index),
    })
  }

  const updateSource = (index: number, updates: Partial<AudienceLabSource>) => {
    const newSources = [...data.sources]
    newSources[index] = { ...newSources[index], ...updates }
    onChange({ ...data, sources: newSources })
  }

  const testConnection = async (index: number) => {
    const source = data.sources[index]
    if (!source.apiUrl || !source.apiKey) return

    setTesting(index)
    setTestResults((prev) => ({ ...prev, [index]: { success: false, message: '' } }))

    try {
      const res = await fetch('/api/onboarding/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'audiencelab',
          apiUrl: source.apiUrl,
          apiKey: source.apiKey,
        }),
      })

      const result = await res.json()
      setTestResults((prev) => ({
        ...prev,
        [index]: {
          success: result.success,
          message: result.success ? 'Connection successful!' : result.error || 'Connection failed',
        },
      }))
    } catch {
      setTestResults((prev) => ({
        ...prev,
        [index]: { success: false, message: 'Failed to test connection' },
      }))
    } finally {
      setTesting(null)
    }
  }

  const handleSkip = () => {
    onChange({ sources: [], skip: true })
    onNext()
  }

  const isValid = data.skip || data.sources.every((s) =>
    s.name &&
    s.apiUrl &&
    s.apiKey &&
    (s.type === 'pixel' || (s.intentKeywords && s.intentKeywords.length > 0))
  )

  return (
    <div className="space-y-6">
      <div>
        <h2 className={cn(jsb.heading, 'text-xl mb-2')}>Data Sources</h2>
        <p className="text-gray-400">
          Connect your AudienceLab pixel or intent data sources (up to 5)
        </p>
      </div>

      {/* Info Card */}
      <div className={cn(jsb.card, 'p-4 flex items-start gap-4')}>
        <div className="w-12 h-12 bg-emerald-500/20 rounded-lg flex items-center justify-center shrink-0">
          <svg
            className="w-6 h-6 text-emerald-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
            />
          </svg>
        </div>
        <div>
          <p className={cn(jsb.heading, 'text-sm mb-1')}>AudienceLab Integration</p>
          <p className="text-sm text-gray-400">
            Connect your website visitor tracking (pixel) or intent data feeds. The system will
            automatically ingest leads daily and run them through qualification.
          </p>
        </div>
      </div>

      {!data.skip && (
        <div className="space-y-4">
          {/* Sources */}
          {data.sources.map((source, index) => (
            <div key={index} className={cn(jsb.card, 'p-4 space-y-4')}>
              <div className="flex items-center justify-between">
                <span className={cn(jsb.heading, 'text-sm')}>Source {index + 1}</span>
                <button
                  onClick={() => removeSource(index)}
                  className="text-gray-500 hover:text-red-400 text-sm"
                >
                  Remove
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={cn(jsb.label, 'block mb-1 text-xs')}>Source Name</label>
                  <input
                    type="text"
                    value={source.name}
                    onChange={(e) => updateSource(index, { name: e.target.value })}
                    className={cn(jsb.input, 'w-full px-3 py-2 text-sm')}
                    placeholder="e.g., Website Pixel"
                  />
                </div>
                <div>
                  <label className={cn(jsb.label, 'block mb-1 text-xs')}>Type</label>
                  <select
                    value={source.type}
                    onChange={(e) => updateSource(index, { type: e.target.value as 'pixel' | 'intent' })}
                    className={cn(jsb.input, 'w-full px-3 py-2 text-sm')}
                  >
                    <option value="pixel">Pixel (Website Visitors)</option>
                    <option value="intent">Intent (Signal Data)</option>
                  </select>
                </div>
              </div>

              {/* Audience Targeting Context - for both types */}
              <div className="col-span-2">
                <label className={cn(jsb.label, 'block mb-1 text-xs')}>
                  Audience Targeting
                  <span className="text-gray-500 font-normal ml-2">
                    (Describe who this audience targets)
                  </span>
                </label>
                <textarea
                  value={source.audienceContext || ''}
                  onChange={(e) => updateSource(index, { audienceContext: e.target.value })}
                  className={cn(jsb.input, 'w-full px-3 py-2 text-sm min-h-[60px]')}
                  placeholder="e.g., VP of Sales and CROs at B2B SaaS companies, 50-500 employees, $5M-50M revenue, US-based, using Salesforce or HubSpot"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Copy your AudienceLab targeting parameters. This context helps personalize outreach.
                </p>
              </div>

              {/* Intent Keywords - only show for intent type */}
              {source.type === 'intent' && (
                <div className="col-span-2">
                  <label className={cn(jsb.label, 'block mb-1 text-xs')}>
                    Intent Keywords
                    <span className="text-gray-500 font-normal ml-2">
                      (What topics are these leads showing intent for?)
                    </span>
                  </label>
                  <textarea
                    value={(source.intentKeywords || []).join(', ')}
                    onChange={(e) => {
                      const keywords = e.target.value
                        .split(/[,\n]/)
                        .map((k) => k.trim())
                        .filter((k) => k.length > 0)
                      updateSource(index, { intentKeywords: keywords })
                    }}
                    className={cn(jsb.input, 'w-full px-3 py-2 text-sm min-h-[80px]')}
                    placeholder="e.g., sales automation, CRM software, lead generation, outbound sales&#10;&#10;Enter keywords separated by commas or new lines"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    These keywords will be used to personalize outreach and match against ICP triggers.
                    Leads from this source are already showing buying intent for these topics.
                  </p>
                </div>
              )}

              <div className={source.type === 'intent' ? 'col-span-2' : ''}>
                <label className={cn(jsb.label, 'block mb-1 text-xs')}>API URL</label>
                <input
                  type="text"
                  value={source.apiUrl}
                  onChange={(e) => updateSource(index, { apiUrl: e.target.value })}
                  className={cn(jsb.input, 'w-full px-3 py-2 text-sm')}
                  placeholder="https://api.audiencelab.io/v1/..."
                />
              </div>

              <div>
                <label className={cn(jsb.label, 'block mb-1 text-xs')}>API Key</label>
                <input
                  type="password"
                  value={source.apiKey}
                  onChange={(e) => updateSource(index, { apiKey: e.target.value })}
                  className={cn(jsb.input, 'w-full px-3 py-2 text-sm')}
                  placeholder="Enter your API key"
                />
              </div>

              <div className="flex items-center gap-4">
                <button
                  onClick={() => testConnection(index)}
                  disabled={!source.apiUrl || !source.apiKey || testing === index}
                  className={cn(jsb.buttonSecondary, 'px-3 py-1.5 text-sm')}
                >
                  {testing === index ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                          fill="none"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                      Testing...
                    </span>
                  ) : (
                    'Test Connection'
                  )}
                </button>
                {testResults[index] && (
                  <span
                    className={cn(
                      'text-sm',
                      testResults[index].success ? 'text-emerald-400' : 'text-red-400'
                    )}
                  >
                    {testResults[index].message}
                  </span>
                )}
              </div>
            </div>
          ))}

          {/* Add Source Button */}
          {data.sources.length < 5 && (
            <button
              onClick={addSource}
              className={cn(
                jsb.card,
                'w-full p-4 text-center border-dashed hover:border-jsb-pink/50 transition-colors'
              )}
            >
              <span className="text-gray-400">
                + Add {data.sources.length === 0 ? 'a data source' : 'another source'}
              </span>
              {data.sources.length > 0 && (
                <span className="text-gray-500 text-sm ml-2">
                  ({5 - data.sources.length} remaining)
                </span>
              )}
            </button>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex gap-3 pt-4">
        <button onClick={onBack} className={cn(jsb.buttonSecondary, 'px-6 py-3')}>
          Back
        </button>
        <button onClick={handleSkip} className={cn(jsb.buttonGhost, 'px-6 py-3')}>
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
