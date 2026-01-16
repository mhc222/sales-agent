'use client'

import { useState } from 'react'
import { jsb, cn, badgeColors } from '@/lib/styles'

interface DataSourceCardProps {
  name: string
  title: string
  description: string
  icon: React.ReactNode
  enabled: boolean
  apiKeyMasked: string | null
  apiUrl?: string
  showApiUrl?: boolean
  onSave: (data: { api_key?: string; api_url?: string; enabled: boolean }) => Promise<void>
  onTest: (data: { api_key: string; api_url?: string }) => Promise<{ success: boolean; message: string; details?: string }>
}

export default function DataSourceCard({
  name,
  title,
  description,
  icon,
  enabled,
  apiKeyMasked,
  apiUrl = '',
  showApiUrl = false,
  onSave,
  onTest,
}: DataSourceCardProps) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; details?: string } | null>(null)
  const [newApiKey, setNewApiKey] = useState('')
  const [newApiUrl, setNewApiUrl] = useState(apiUrl)
  const [enabledState, setEnabledState] = useState(enabled)

  const handleTest = async () => {
    if (!newApiKey && !apiKeyMasked) return

    setTesting(true)
    setTestResult(null)

    try {
      const result = await onTest({
        api_key: newApiKey || 'existing',
        api_url: showApiUrl ? newApiUrl : undefined,
      })
      setTestResult(result)
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : 'Test failed',
      })
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setTestResult(null)

    try {
      await onSave({
        api_key: newApiKey || undefined,
        api_url: showApiUrl ? newApiUrl : undefined,
        enabled: enabledState,
      })
      setEditing(false)
      setNewApiKey('')
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : 'Save failed',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setEditing(false)
    setNewApiKey('')
    setNewApiUrl(apiUrl)
    setEnabledState(enabled)
    setTestResult(null)
  }

  return (
    <div className={cn(jsb.card, 'p-6')}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-jsb-navy-lighter rounded-lg flex items-center justify-center text-gray-400">
            {icon}
          </div>
          <div>
            <h3 className={cn(jsb.heading, 'text-base')}>{title}</h3>
            <p className="text-xs text-gray-500">{description}</p>
          </div>
        </div>
        <span className={cn(jsb.badge, enabled ? badgeColors.success : badgeColors.neutral)}>
          {enabled ? 'Connected' : 'Not Setup'}
        </span>
      </div>

      {/* Content */}
      {editing ? (
        <div className="space-y-4">
          {/* API URL (for pixel/intent) */}
          {showApiUrl && (
            <div>
              <label htmlFor={`${name}-api-url`} className={cn(jsb.label, 'block mb-2')}>
                API URL
              </label>
              <input
                id={`${name}-api-url`}
                type="text"
                value={newApiUrl}
                onChange={(e) => setNewApiUrl(e.target.value)}
                className={cn(jsb.input, 'w-full px-4 py-2.5')}
                placeholder="https://api.example.com/segments/..."
              />
            </div>
          )}

          {/* API Key */}
          <div>
            <label htmlFor={`${name}-api-key`} className={cn(jsb.label, 'block mb-2')}>
              API Key {apiKeyMasked && '(leave empty to keep existing)'}
            </label>
            <input
              id={`${name}-api-key`}
              type="password"
              value={newApiKey}
              onChange={(e) => setNewApiKey(e.target.value)}
              className={cn(jsb.input, 'w-full px-4 py-2.5')}
              placeholder={apiKeyMasked || 'Enter your API key'}
            />
          </div>

          {/* Enable toggle */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id={`${name}-enabled`}
              checked={enabledState}
              onChange={(e) => setEnabledState(e.target.checked)}
              className="w-4 h-4 rounded border-gray-600 bg-jsb-navy text-jsb-pink focus:ring-jsb-pink"
            />
            <label htmlFor={`${name}-enabled`} className="text-sm text-gray-300">
              Enable this data source
            </label>
          </div>

          {/* Test result */}
          {testResult && (
            <div
              className={cn(
                'p-3 rounded-lg text-sm',
                testResult.success
                  ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                  : 'bg-red-500/10 border border-red-500/30 text-red-400'
              )}
            >
              <p className="font-medium">{testResult.message}</p>
              {testResult.details && <p className="text-xs mt-1 opacity-80">{testResult.details}</p>}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleTest}
              disabled={testing || (!newApiKey && !apiKeyMasked)}
              className={cn(jsb.buttonSecondary, 'px-4 py-2')}
            >
              {testing ? 'Testing...' : 'Test Connection'}
            </button>
            <div className="flex-1" />
            <button onClick={handleCancel} className={cn(jsb.buttonGhost, 'px-4 py-2')}>
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className={cn(jsb.buttonPrimary, 'px-4 py-2')}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      ) : (
        <div>
          {/* Current status */}
          {enabled && apiKeyMasked ? (
            <div className="space-y-2">
              {showApiUrl && apiUrl && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500">URL:</span>
                  <span className="text-gray-300 font-mono text-xs truncate max-w-xs">{apiUrl}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500">API Key:</span>
                <span className="text-gray-300 font-mono">{apiKeyMasked}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              No {title.toLowerCase()} credentials configured.
            </p>
          )}

          {/* Edit button */}
          <button
            onClick={() => setEditing(true)}
            className={cn(jsb.buttonSecondary, 'px-4 py-2 mt-4')}
          >
            {enabled ? 'Update Configuration' : 'Configure'}
          </button>
        </div>
      )}
    </div>
  )
}
