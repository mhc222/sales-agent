'use client'

import React, { useState } from 'react'
import type { ReactElement } from 'react'
import { jsb, cn } from '@/lib/styles'
import type { DataSourceType, CampaignDataSourceConfig, TenantICP } from '@/src/lib/tenant-settings'

export interface DataSourceData {
  type: DataSourceType | ''
  config: CampaignDataSourceConfig
  autoIngest: boolean
}

type Props = {
  data: DataSourceData
  brandIcp?: TenantICP | null
  onChange: (data: DataSourceData) => void
  onNext: () => void
  onBack: () => void
}

const dataSourceOptions: {
  id: DataSourceType
  label: string
  description: string
  requiresCredentials: boolean
  icon: ReactElement
}[] = [
  {
    id: 'intent',
    label: 'Intent Data',
    description: 'Import leads showing buying intent from AudienceLab intent feeds',
    requiresCredentials: true,
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
  {
    id: 'pixel',
    label: 'Website Pixel',
    description: 'Capture leads who visit your website via AudienceLab pixel',
    requiresCredentials: true,
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    id: 'apollo',
    label: 'Apollo.io',
    description: 'Search and import leads from Apollo database using saved searches',
    requiresCredentials: true,
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <path strokeLinecap="round" d="M12 6v6l4 2" />
      </svg>
    ),
  },
  {
    id: 'csv',
    label: 'CSV Upload',
    description: 'Upload leads manually via CSV file',
    requiresCredentials: false,
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
      </svg>
    ),
  },
  {
    id: 'manual',
    label: 'Manual Entry',
    description: 'Add leads one-by-one manually',
    requiresCredentials: false,
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
    ),
  },
]

export default function DataSourceStep({ data, brandIcp, onChange, onNext, onBack }: Props) {
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  const selectedOption = dataSourceOptions.find((opt) => opt.id === data.type)
  const needsCredentials = selectedOption?.requiresCredentials ?? false

  // Validation
  const isValid = (() => {
    if (!data.type) return false
    if (data.type === 'intent' || data.type === 'pixel') {
      return !!(data.config.api_url && data.config.api_key)
    }
    if (data.type === 'apollo') {
      return !!data.config.api_key
    }
    return true
  })()

  const testConnection = async () => {
    if (!data.type || !needsCredentials) return
    setTesting(true)
    setTestResult(null)

    try {
      const res = await fetch('/api/onboarding/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: data.type === 'intent' || data.type === 'pixel' ? 'audiencelab' : data.type,
          apiKey: data.config.api_key,
          apiUrl: data.config.api_url,
        }),
      })

      const result = await res.json()
      setTestResult({
        success: result.success,
        message: result.success ? 'Connection successful!' : result.error || 'Connection failed',
      })
    } catch {
      setTestResult({ success: false, message: 'Failed to test connection' })
    } finally {
      setTesting(false)
    }
  }

  const selectType = (type: DataSourceType) => {
    onChange({
      ...data,
      type,
      config: {}, // Reset config when type changes
    })
    setTestResult(null)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className={cn(jsb.heading, 'text-xl mb-2')}>Data Source</h2>
        <p className="text-gray-400">Choose how leads will be added to this campaign</p>
      </div>

      {/* Brand ICP Display */}
      {brandIcp && (
        <div className={cn(jsb.card, 'p-4 bg-emerald-500/10 border-emerald-500/30')}>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className={cn(jsb.heading, 'text-sm text-emerald-400')}>ICP Inherited from Brand</p>
              <p className="text-xs text-gray-400 mt-1">
                Leads will be qualified against the brand&apos;s ICP criteria
                {brandIcp.personas?.length && ` (${brandIcp.personas.length} personas)`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Data Source Type Selection */}
      <div>
        <label className={cn(jsb.label, 'block mb-3')}>Select Data Source Type</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {dataSourceOptions.map((option) => {
            const isSelected = data.type === option.id
            return (
              <button
                key={option.id}
                onClick={() => selectType(option.id)}
                className={cn(
                  jsb.card,
                  'p-4 text-left transition-all duration-200',
                  isSelected ? 'border-jsb-pink bg-jsb-pink/10' : 'hover:border-gray-600'
                )}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      'w-10 h-10 rounded-lg flex items-center justify-center shrink-0',
                      isSelected ? 'bg-jsb-pink/20 text-jsb-pink' : 'bg-jsb-navy-lighter text-gray-400'
                    )}
                  >
                    {option.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn(jsb.heading, 'text-sm')}>{option.label}</p>
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{option.description}</p>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Credentials Input (for intent/pixel/apollo) */}
      {data.type && needsCredentials && (
        <div className={cn(jsb.card, 'p-5 space-y-4')}>
          <h3 className={cn(jsb.heading, 'text-sm')}>
            {data.type === 'apollo' ? 'Apollo' : 'AudienceLab'} Credentials
          </h3>

          {/* API URL (for intent/pixel) */}
          {(data.type === 'intent' || data.type === 'pixel') && (
            <div>
              <label className={cn(jsb.label, 'block mb-2')}>API URL</label>
              <input
                type="url"
                value={data.config.api_url || ''}
                onChange={(e) => onChange({ ...data, config: { ...data.config, api_url: e.target.value } })}
                className={cn(jsb.input, 'w-full px-4 py-3')}
                placeholder="https://api.audiencelab.io/segment/..."
              />
            </div>
          )}

          {/* API Key */}
          <div>
            <label className={cn(jsb.label, 'block mb-2')}>API Key</label>
            <input
              type="password"
              value={data.config.api_key || ''}
              onChange={(e) => onChange({ ...data, config: { ...data.config, api_key: e.target.value } })}
              className={cn(jsb.input, 'w-full px-4 py-3')}
              placeholder={data.type === 'apollo' ? 'Enter Apollo API key' : 'Enter AudienceLab API key'}
            />
          </div>

          {/* Saved Search ID (for Apollo) */}
          {data.type === 'apollo' && (
            <div>
              <label className={cn(jsb.label, 'block mb-2')}>Saved Search ID (Optional)</label>
              <input
                type="text"
                value={data.config.saved_search_id || ''}
                onChange={(e) => onChange({ ...data, config: { ...data.config, saved_search_id: e.target.value } })}
                className={cn(jsb.input, 'w-full px-4 py-3')}
                placeholder="Apollo saved search ID"
              />
              <p className="text-xs text-gray-500 mt-1">
                Use a saved search to auto-import matching leads
              </p>
            </div>
          )}

          {/* Test Connection */}
          <div className="flex items-center gap-4 pt-2">
            <button
              onClick={testConnection}
              disabled={testing || !data.config.api_key}
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
                'Test Connection'
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

      {/* Auto-Ingest Toggle */}
      {data.type && data.type !== 'manual' && data.type !== 'csv' && (
        <div className={cn(jsb.card, 'p-4')}>
          <label className="flex items-start gap-4 cursor-pointer">
            <div className="pt-0.5">
              <input
                type="checkbox"
                checked={data.autoIngest}
                onChange={(e) => onChange({ ...data, autoIngest: e.target.checked })}
                className="rounded border-gray-600 text-jsb-pink focus:ring-jsb-pink"
              />
            </div>
            <div>
              <span className={cn(jsb.heading, 'text-sm')}>Enable Auto-Ingestion</span>
              <p className="text-xs text-gray-500 mt-1">
                Automatically import new leads from this source daily (requires campaign to be active)
              </p>
            </div>
          </label>
        </div>
      )}

      {/* Navigation */}
      <div className="flex gap-3 pt-4">
        <button onClick={onBack} className={cn(jsb.buttonSecondary, 'px-6 py-3')}>
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
