'use client'

import { useState } from 'react'
import { jsb, cn, badgeColors } from '@/lib/styles'

interface ProviderCardProps {
  provider: 'smartlead' | 'nureply' | 'instantly' | 'heyreach'
  name: string
  description: string
  features: string[]
  notes?: string
  isActive: boolean
  isConfigured: boolean
  apiKeyMasked: string | null
  campaignId?: string
  showCampaignId?: boolean
  onTest: (apiKey: string) => Promise<{ success: boolean; message: string; details?: string }>
  onUpdate: (data: { apiKey?: string; campaignId?: string }) => Promise<void>
  onSetActive: () => Promise<void>
}

export default function ProviderCard({
  provider,
  name,
  description,
  features,
  notes,
  isActive,
  isConfigured,
  apiKeyMasked,
  campaignId = '',
  showCampaignId = false,
  onTest,
  onUpdate,
  onSetActive,
}: ProviderCardProps) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [settingActive, setSettingActive] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; details?: string } | null>(null)
  const [newApiKey, setNewApiKey] = useState('')
  const [newCampaignId, setNewCampaignId] = useState(campaignId)
  const [showApiKey, setShowApiKey] = useState(false)

  const handleTest = async () => {
    if (!newApiKey && !apiKeyMasked) return

    setTesting(true)
    setTestResult(null)

    try {
      // Use new key if entered, otherwise pass empty string to use existing
      const result = await onTest(newApiKey)
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
      await onUpdate({
        apiKey: newApiKey || undefined,
        campaignId: showCampaignId ? newCampaignId : undefined,
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

  const handleSetActive = async () => {
    setSettingActive(true)
    try {
      await onSetActive()
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : 'Failed to set active',
      })
    } finally {
      setSettingActive(false)
    }
  }

  const handleCancel = () => {
    setEditing(false)
    setNewApiKey('')
    setNewCampaignId(campaignId)
    setTestResult(null)
    setShowApiKey(false)
  }

  return (
    <div className={cn(jsb.card, 'p-6', isActive && 'ring-2 ring-jsb-pink/50')}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          {/* Active/Inactive indicator */}
          <div className={cn(
            'w-3 h-3 rounded-full',
            isActive ? 'bg-jsb-pink' : 'bg-gray-600'
          )} />
          <div>
            <h3 className={cn(jsb.heading, 'text-base uppercase tracking-wide')}>{name}</h3>
            <p className="text-xs text-gray-500">{description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isActive && (
            <span className={cn(jsb.badge, badgeColors.pink)}>
              Active
            </span>
          )}
          <span className={cn(jsb.badge, isConfigured ? badgeColors.success : badgeColors.neutral)}>
            {isConfigured ? 'Connected' : 'Not Setup'}
          </span>
        </div>
      </div>

      {/* Content */}
      {editing ? (
        <div className="space-y-4">
          {/* API Key */}
          <div>
            <label htmlFor={`${provider}-api-key`} className={cn(jsb.label, 'block mb-2')}>
              API Key {apiKeyMasked && '(leave empty to keep existing)'}
            </label>
            <div className="flex gap-2">
              <input
                id={`${provider}-api-key`}
                type={showApiKey ? 'text' : 'password'}
                value={newApiKey}
                onChange={(e) => setNewApiKey(e.target.value)}
                className={cn(jsb.input, 'flex-1 px-4 py-2.5')}
                placeholder={apiKeyMasked || 'Enter your API key'}
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className={cn(jsb.buttonSecondary, 'px-3 py-2')}
              >
                {showApiKey ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {/* Campaign ID (optional) */}
          {showCampaignId && (
            <div>
              <label htmlFor={`${provider}-campaign-id`} className={cn(jsb.label, 'block mb-2')}>
                Campaign ID (optional)
              </label>
              <input
                id={`${provider}-campaign-id`}
                type="text"
                value={newCampaignId}
                onChange={(e) => setNewCampaignId(e.target.value)}
                className={cn(jsb.input, 'w-full px-4 py-2.5')}
                placeholder="Enter campaign ID"
              />
            </div>
          )}

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
              {saving ? 'Saving...' : 'Update'}
            </button>
          </div>
        </div>
      ) : (
        <div>
          {/* Current status */}
          {isConfigured && apiKeyMasked ? (
            <div className="space-y-2 mb-4">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500">API Key:</span>
                <span className="text-gray-300 font-mono">{apiKeyMasked}</span>
              </div>
              {showCampaignId && campaignId && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500">Campaign ID:</span>
                  <span className="text-gray-300 font-mono">{campaignId}</span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500 mb-4">
              No {name} credentials configured.
            </p>
          )}

          {/* Features */}
          <div className="mb-4">
            <p className="text-xs text-gray-500 mb-1">Features:</p>
            <p className="text-sm text-gray-400">{features.join(', ')}</p>
          </div>

          {/* Notes */}
          {notes && (
            <div className="mb-4 p-2 bg-jsb-navy/50 rounded text-xs text-gray-500">
              Note: {notes}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setEditing(true)}
              className={cn(jsb.buttonSecondary, 'px-4 py-2')}
            >
              {isConfigured ? 'Update' : 'Connect'}
            </button>
            {isConfigured && !isActive && (
              <button
                onClick={handleSetActive}
                disabled={settingActive}
                className={cn(jsb.buttonPrimary, 'px-4 py-2')}
              >
                {settingActive ? 'Setting...' : 'Make Active'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
