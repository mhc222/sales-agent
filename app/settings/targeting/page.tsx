'use client'

import { useState, useEffect } from 'react'
import { Shell } from '@/components/layout/Shell'
import { jsb, cn } from '@/lib/styles'

interface TargetingPreference {
  field: string
  preference: string
  weight?: number
  created_at?: string
  updated_at?: string
}

interface AvailableField {
  field: string
  label: string
  basePoints: number
}

export default function TargetingPage() {
  const [preferences, setPreferences] = useState<TargetingPreference[]>([])
  const [availableFields, setAvailableFields] = useState<AvailableField[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // New preference form state
  const [isAdding, setIsAdding] = useState(false)
  const [newField, setNewField] = useState('')
  const [newPreference, setNewPreference] = useState('')
  const [newWeight, setNewWeight] = useState(1.5)

  useEffect(() => {
    fetchPreferences()
  }, [])

  const fetchPreferences = async () => {
    try {
      const res = await fetch('/api/settings/targeting')
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to load preferences')
        return
      }

      setPreferences(data.preferences || [])
      setAvailableFields(data.availableFields || [])
    } catch (err) {
      setError('Failed to load targeting preferences')
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = async () => {
    if (!newField || !newPreference) {
      setError('Please select a field and enter a preference')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const res = await fetch('/api/settings/targeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field: newField,
          preference: newPreference,
          weight: newWeight,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save')
      }

      const data = await res.json()
      setPreferences(data.preferences)
      setIsAdding(false)
      setNewField('')
      setNewPreference('')
      setNewWeight(1.5)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save preference')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (field: string) => {
    setSaving(true)
    setError(null)

    try {
      const res = await fetch(`/api/settings/targeting?field=${encodeURIComponent(field)}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to delete')
      }

      const data = await res.json()
      setPreferences(data.preferences)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete preference')
    } finally {
      setSaving(false)
    }
  }

  const getFieldLabel = (field: string) => {
    const found = availableFields.find(f => f.field === field)
    return found?.label || field
  }

  const getBasePoints = (field: string) => {
    const found = availableFields.find(f => f.field === field)
    return found?.basePoints || 15
  }

  const calculateAdjustment = (field: string, weight: number = 1.5) => {
    const basePoints = getBasePoints(field)
    const adjustment = Math.round(basePoints * (weight - 1))
    return adjustment > 0 ? `+${adjustment}` : adjustment.toString()
  }

  // Filter out fields that already have preferences
  const unusedFields = availableFields.filter(
    f => !preferences.find(p => p.field === f.field)
  )

  if (loading) {
    return (
      <Shell>
        <div className="p-6 lg:p-8">
          <div className="flex items-center justify-center h-64">
            <div className="flex items-center gap-3 text-gray-400">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Loading preferences...
            </div>
          </div>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <div className="p-6 lg:p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className={cn(jsb.heading, 'text-2xl mb-2')}>Targeting Preferences</h1>
          <p className="text-gray-400">
            Adjust how leads are scored based on specific attributes. Preferences add or subtract points when leads match your criteria.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/30">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Current Preferences */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className={cn(jsb.label, 'text-sm')}>Active Preferences</h2>
            {!isAdding && unusedFields.length > 0 && (
              <button
                onClick={() => setIsAdding(true)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm font-medium',
                  'bg-jsb-pink/10 text-jsb-pink hover:bg-jsb-pink/20 transition-colors'
                )}
              >
                + Add Preference
              </button>
            )}
          </div>

          {preferences.length === 0 && !isAdding ? (
            <div className={cn(jsb.card, 'p-8 text-center')}>
              <div className="text-gray-400 mb-4">
                <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
                <p className="text-sm">No targeting preferences set</p>
                <p className="text-xs mt-1 text-gray-500">Add preferences to customize how leads are scored</p>
              </div>
              <button
                onClick={() => setIsAdding(true)}
                className={cn(
                  'px-4 py-2 rounded-lg text-sm font-medium',
                  'bg-jsb-pink text-white hover:bg-jsb-pink/90 transition-colors'
                )}
              >
                Add Your First Preference
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {preferences.map((pref) => (
                <div
                  key={pref.field}
                  className={cn(jsb.card, 'p-4 flex items-center justify-between')}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-white font-medium">{getFieldLabel(pref.field)}</span>
                      <span className={cn(
                        'px-2 py-0.5 rounded text-xs font-medium',
                        (pref.weight || 1.5) >= 1
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-red-500/20 text-red-400'
                      )}>
                        {calculateAdjustment(pref.field, pref.weight)} pts
                      </span>
                      <span className="text-xs text-gray-500">
                        ({pref.weight || 1.5}x weight)
                      </span>
                    </div>
                    <p className="text-sm text-gray-400">{pref.preference}</p>
                  </div>
                  <button
                    onClick={() => handleDelete(pref.field)}
                    disabled={saving}
                    className="p-2 text-gray-500 hover:text-red-400 transition-colors"
                    title="Remove preference"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add New Preference Form */}
        {isAdding && (
          <div className={cn(jsb.card, 'p-6 mb-8')}>
            <h3 className={cn(jsb.heading, 'text-sm mb-4')}>Add New Preference</h3>

            <div className="space-y-4">
              {/* Field Selection */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">Field to Target</label>
                <select
                  value={newField}
                  onChange={(e) => setNewField(e.target.value)}
                  className={cn(
                    'w-full px-3 py-2 rounded-lg',
                    'bg-white/5 border border-white/10',
                    'text-white focus:border-jsb-pink focus:outline-none'
                  )}
                >
                  <option value="">Select a field...</option>
                  {unusedFields.map((f) => (
                    <option key={f.field} value={f.field}>
                      {f.label} (base: {f.basePoints} pts)
                    </option>
                  ))}
                </select>
              </div>

              {/* Preference Description */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">Preference Rule</label>
                <input
                  type="text"
                  value={newPreference}
                  onChange={(e) => setNewPreference(e.target.value)}
                  placeholder="e.g., Prioritize Director level and above"
                  className={cn(
                    'w-full px-3 py-2 rounded-lg',
                    'bg-white/5 border border-white/10',
                    'text-white placeholder-gray-500',
                    'focus:border-jsb-pink focus:outline-none'
                  )}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Describe what you want to prioritize or deprioritize
                </p>
              </div>

              {/* Weight Slider */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Weight Multiplier: <span className="text-white">{newWeight}x</span>
                  {newField && (
                    <span className="text-gray-500 ml-2">
                      ({calculateAdjustment(newField, newWeight)} pts adjustment)
                    </span>
                  )}
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="2.5"
                  step="0.1"
                  value={newWeight}
                  onChange={(e) => setNewWeight(parseFloat(e.target.value))}
                  className="w-full accent-jsb-pink"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>Deprioritize (0.5x)</span>
                  <span>Normal (1x)</span>
                  <span>Prioritize (2.5x)</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleAdd}
                  disabled={saving || !newField || !newPreference}
                  className={cn(
                    'px-4 py-2 rounded-lg text-sm font-medium',
                    'bg-jsb-pink text-white',
                    'hover:bg-jsb-pink/90 transition-colors',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                >
                  {saving ? 'Saving...' : 'Add Preference'}
                </button>
                <button
                  onClick={() => {
                    setIsAdding(false)
                    setNewField('')
                    setNewPreference('')
                    setNewWeight(1.5)
                    setError(null)
                  }}
                  disabled={saving}
                  className={cn(
                    'px-4 py-2 rounded-lg text-sm font-medium',
                    'bg-white/5 text-gray-400',
                    'hover:bg-white/10 transition-colors'
                  )}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Info Card */}
        <div className={cn(jsb.card, 'p-6')}>
          <h3 className={cn(jsb.heading, 'text-sm mb-2')}>How Targeting Works</h3>
          <ul className="text-sm text-gray-400 space-y-2">
            <li className="flex items-start gap-2">
              <span className="text-jsb-pink mt-1">1.</span>
              <span>
                <strong className="text-white">Base Points</strong> - Each field has a base point value when matched (e.g., Industry = 25 pts)
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-jsb-pink mt-1">2.</span>
              <span>
                <strong className="text-white">Weight Multiplier</strong> - Your preference adjusts the score: 1.5x adds 50% of base points, 0.5x subtracts 50%
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-jsb-pink mt-1">3.</span>
              <span>
                <strong className="text-white">Preference Matching</strong> - The AI analyzes if a lead matches your preference description
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-jsb-pink mt-1">4.</span>
              <span>
                Preferences are applied during lead scoring and affect prioritization in your outreach queue
              </span>
            </li>
          </ul>
        </div>

        {/* Available Fields Reference */}
        <div className={cn(jsb.card, 'p-6 mt-6')}>
          <h3 className={cn(jsb.heading, 'text-sm mb-4')}>Available Fields</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {availableFields.map((f) => {
              const isUsed = preferences.find(p => p.field === f.field)
              return (
                <div
                  key={f.field}
                  className={cn(
                    'px-3 py-2 rounded-lg text-sm',
                    isUsed
                      ? 'bg-jsb-pink/10 text-jsb-pink border border-jsb-pink/30'
                      : 'bg-white/5 text-gray-400'
                  )}
                >
                  <div className="font-medium">{f.label}</div>
                  <div className="text-xs opacity-70">{f.basePoints} pts</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </Shell>
  )
}
