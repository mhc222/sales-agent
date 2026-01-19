'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Shell } from '@/components/layout/Shell'
import { jsb, cn, badgeColors } from '@/lib/styles'

interface Brand {
  id: string
  name: string
  description?: string
}

type CampaignMode = 'email_only' | 'linkedin_only' | 'multi_channel'

const modeOptions: { value: CampaignMode; label: string; description: string }[] = [
  {
    value: 'email_only',
    label: 'Email Only',
    description: 'Reach prospects through personalized email sequences',
  },
  {
    value: 'linkedin_only',
    label: 'LinkedIn Only',
    description: 'Connect and engage prospects on LinkedIn',
  },
  {
    value: 'multi_channel',
    label: 'Multi-Channel',
    description: 'Combine email and LinkedIn for maximum engagement',
  },
]

export default function NewCampaignPage() {
  const router = useRouter()
  const [brands, setBrands] = useState<Brand[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [brandId, setBrandId] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [mode, setMode] = useState<CampaignMode>('email_only')
  const [customInstructions, setCustomInstructions] = useState('')
  const [targetPersona, setTargetPersona] = useState('')
  const [primaryAngle, setPrimaryAngle] = useState('')
  const [emailCount, setEmailCount] = useState(7)
  const [linkedinCount, setLinkedinCount] = useState(4)
  const [linkedinFirst, setLinkedinFirst] = useState(false)
  const [waitForConnection, setWaitForConnection] = useState(true)
  const [connectionTimeoutHours, setConnectionTimeoutHours] = useState(72)
  const [smartleadCampaignId, setSmartleadCampaignId] = useState('')
  const [heyreachCampaignId, setHeyreachCampaignId] = useState('')

  useEffect(() => {
    fetchBrands()
  }, [])

  const fetchBrands = async () => {
    try {
      const res = await fetch('/api/brands')
      const data = await res.json()
      if (res.ok) {
        setBrands(data.brands || [])
        if (data.brands?.length > 0) {
          setBrandId(data.brands[0].id)
        }
      }
    } catch (err) {
      console.error('Failed to load brands:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand_id: brandId,
          name,
          description: description || undefined,
          mode,
          custom_instructions: customInstructions || undefined,
          target_persona: targetPersona || undefined,
          primary_angle: primaryAngle || undefined,
          email_count: emailCount,
          linkedin_count: linkedinCount,
          linkedin_first: linkedinFirst,
          wait_for_connection: waitForConnection,
          connection_timeout_hours: connectionTimeoutHours,
          smartlead_campaign_id: smartleadCampaignId || undefined,
          heyreach_campaign_id: heyreachCampaignId || undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to create campaign')
        return
      }

      router.push(`/campaigns/${data.campaign.id}`)
    } catch (err) {
      setError('Failed to create campaign')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <Shell>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-jsb-pink"></div>
        </div>
      </Shell>
    )
  }

  if (brands.length === 0) {
    return (
      <Shell>
        <div className="p-6 lg:p-8">
          <div className={cn(jsb.card, 'p-8 text-center')}>
            <svg className="w-12 h-12 text-gray-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <h3 className={cn(jsb.heading, 'text-lg mb-2')}>No brands found</h3>
            <p className={jsb.subheading}>You need to create a brand before creating campaigns.</p>
          </div>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <div className="p-6 lg:p-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link
            href="/campaigns"
            className={cn(jsb.buttonGhost, 'p-2')}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </Link>
          <div>
            <h1 className={cn(jsb.heading, 'text-2xl')}>New Campaign</h1>
            <p className={jsb.subheading}>Create a new outreach campaign</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl">
          {error && (
            <div className="bg-red-500/20 border border-red-500/30 rounded-md p-4 text-red-400">
              {error}
            </div>
          )}

          {/* Brand Selection */}
          <div className={cn(jsb.card, 'p-6')}>
            <h2 className={cn(jsb.heading, 'text-lg mb-4')}>Brand</h2>
            <div>
              <label className={cn(jsb.label, 'block mb-2')}>Select Brand</label>
              <select
                value={brandId}
                onChange={(e) => setBrandId(e.target.value)}
                className={cn(jsb.select, 'w-full px-3 py-2')}
                required
              >
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Basic Info */}
          <div className={cn(jsb.card, 'p-6')}>
            <h2 className={cn(jsb.heading, 'text-lg mb-4')}>Campaign Details</h2>
            <div className="space-y-4">
              <div>
                <label className={cn(jsb.label, 'block mb-2')}>Campaign Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={cn(jsb.input, 'w-full px-3 py-2')}
                  placeholder="e.g., Q1 SaaS Outreach"
                  required
                />
              </div>
              <div>
                <label className={cn(jsb.label, 'block mb-2')}>Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className={cn(jsb.input, 'w-full px-3 py-2')}
                  rows={2}
                  placeholder="Brief description of this campaign"
                />
              </div>
            </div>
          </div>

          {/* Campaign Mode */}
          <div className={cn(jsb.card, 'p-6')}>
            <h2 className={cn(jsb.heading, 'text-lg mb-4')}>Campaign Mode</h2>
            <div className="grid gap-3">
              {modeOptions.map((option) => (
                <label
                  key={option.value}
                  className={cn(
                    'flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors',
                    mode === option.value
                      ? 'bg-jsb-pink/10 border-jsb-pink'
                      : 'bg-jsb-navy border-jsb-navy-lighter hover:border-gray-600'
                  )}
                >
                  <input
                    type="radio"
                    name="mode"
                    value={option.value}
                    checked={mode === option.value}
                    onChange={(e) => setMode(e.target.value as CampaignMode)}
                    className="mt-1"
                  />
                  <div>
                    <p className={jsb.heading}>{option.label}</p>
                    <p className={jsb.subheading}>{option.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Targeting */}
          <div className={cn(jsb.card, 'p-6')}>
            <h2 className={cn(jsb.heading, 'text-lg mb-4')}>Targeting</h2>
            <div className="space-y-4">
              <div>
                <label className={cn(jsb.label, 'block mb-2')}>Target Persona</label>
                <input
                  type="text"
                  value={targetPersona}
                  onChange={(e) => setTargetPersona(e.target.value)}
                  className={cn(jsb.input, 'w-full px-3 py-2')}
                  placeholder="e.g., VP of Marketing at B2B SaaS companies"
                />
              </div>
              <div>
                <label className={cn(jsb.label, 'block mb-2')}>Primary Angle</label>
                <input
                  type="text"
                  value={primaryAngle}
                  onChange={(e) => setPrimaryAngle(e.target.value)}
                  className={cn(jsb.input, 'w-full px-3 py-2')}
                  placeholder="e.g., Cost reduction, Efficiency gains"
                />
              </div>
            </div>
          </div>

          {/* Custom Instructions */}
          <div className={cn(jsb.card, 'p-6')}>
            <h2 className={cn(jsb.heading, 'text-lg mb-4')}>Custom Instructions</h2>
            <p className={cn(jsb.subheading, 'mb-4')}>
              These instructions will be added to the AI when generating sequences for this campaign.
              They override brand-level defaults.
            </p>
            <textarea
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              className={cn(jsb.input, 'w-full px-3 py-2')}
              rows={4}
              placeholder="e.g., Focus on ROI messaging. Avoid mentioning competitors. Keep emails under 100 words."
            />
          </div>

          {/* Sequence Settings */}
          <div className={cn(jsb.card, 'p-6')}>
            <h2 className={cn(jsb.heading, 'text-lg mb-4')}>Sequence Settings</h2>
            <div className="grid grid-cols-2 gap-4">
              {mode !== 'linkedin_only' && (
                <div>
                  <label className={cn(jsb.label, 'block mb-2')}>Email Steps</label>
                  <input
                    type="number"
                    value={emailCount}
                    onChange={(e) => setEmailCount(parseInt(e.target.value) || 7)}
                    className={cn(jsb.input, 'w-full px-3 py-2')}
                    min={1}
                    max={15}
                  />
                </div>
              )}
              {mode !== 'email_only' && (
                <div>
                  <label className={cn(jsb.label, 'block mb-2')}>LinkedIn Steps</label>
                  <input
                    type="number"
                    value={linkedinCount}
                    onChange={(e) => setLinkedinCount(parseInt(e.target.value) || 4)}
                    className={cn(jsb.input, 'w-full px-3 py-2')}
                    min={1}
                    max={10}
                  />
                </div>
              )}
            </div>

            {mode === 'multi_channel' && (
              <div className="mt-4 space-y-4 pt-4 border-t border-jsb-navy-lighter">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={linkedinFirst}
                    onChange={(e) => setLinkedinFirst(e.target.checked)}
                    className="rounded border-gray-600 text-jsb-pink focus:ring-jsb-pink"
                  />
                  <span className="text-gray-300">Start with LinkedIn before email</span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={waitForConnection}
                    onChange={(e) => setWaitForConnection(e.target.checked)}
                    className="rounded border-gray-600 text-jsb-pink focus:ring-jsb-pink"
                  />
                  <span className="text-gray-300">Wait for LinkedIn connection before sending messages</span>
                </label>

                {waitForConnection && (
                  <div className="ml-6">
                    <label className={cn(jsb.label, 'block mb-2')}>Connection Timeout (hours)</label>
                    <input
                      type="number"
                      value={connectionTimeoutHours}
                      onChange={(e) => setConnectionTimeoutHours(parseInt(e.target.value) || 72)}
                      className={cn(jsb.input, 'w-32 px-3 py-2')}
                      min={24}
                      max={168}
                    />
                    <p className={cn(jsb.subheading, 'mt-1')}>
                      Fall back to email if not connected within this time
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Platform Integration */}
          <div className={cn(jsb.card, 'p-6')}>
            <h2 className={cn(jsb.heading, 'text-lg mb-2')}>Platform Integration</h2>
            <p className={cn(jsb.subheading, 'mb-4')}>
              Link this campaign to existing campaigns in Smartlead and HeyReach.
              Create template campaigns in each platform first, then enter their IDs here.
            </p>
            <div className="grid grid-cols-2 gap-4">
              {mode !== 'linkedin_only' && (
                <div>
                  <label className={cn(jsb.label, 'block mb-2')}>Smartlead Campaign ID</label>
                  <input
                    type="text"
                    value={smartleadCampaignId}
                    onChange={(e) => setSmartleadCampaignId(e.target.value)}
                    className={cn(jsb.input, 'w-full px-3 py-2')}
                    placeholder="e.g., 12345"
                  />
                </div>
              )}
              {mode !== 'email_only' && (
                <div>
                  <label className={cn(jsb.label, 'block mb-2')}>HeyReach Campaign ID</label>
                  <input
                    type="text"
                    value={heyreachCampaignId}
                    onChange={(e) => setHeyreachCampaignId(e.target.value)}
                    className={cn(jsb.input, 'w-full px-3 py-2')}
                    placeholder="e.g., abc-123"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-4 pt-4">
            <button
              type="submit"
              disabled={submitting || !name || !brandId}
              className={cn(jsb.buttonPrimary, 'px-6 py-2')}
            >
              {submitting ? 'Creating...' : 'Create Campaign'}
            </button>
            <Link
              href="/campaigns"
              className={cn(jsb.buttonSecondary, 'px-6 py-2')}
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </Shell>
  )
}
