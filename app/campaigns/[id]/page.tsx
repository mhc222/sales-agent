'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Shell } from '@/components/layout/Shell'
import { jsb, cn, badgeColors } from '@/lib/styles'

interface Campaign {
  id: string
  brand_id: string
  name: string
  description?: string
  mode: 'email_only' | 'linkedin_only' | 'multi_channel'
  status: 'draft' | 'active' | 'paused' | 'completed'
  custom_instructions?: string
  target_persona?: string
  primary_angle?: string
  email_count: number
  linkedin_count: number
  email_tone?: string
  email_cta?: string
  linkedin_first: boolean
  wait_for_connection: boolean
  connection_timeout_hours: number
  total_leads: number
  leads_contacted: number
  leads_replied: number
  leads_converted: number
  smartlead_campaign_id?: string
  heyreach_campaign_id?: string
  created_at: string
  activated_at?: string
  brand?: {
    id: string
    name: string
  }
}

const modeLabels = {
  email_only: 'Email Only',
  linkedin_only: 'LinkedIn Only',
  multi_channel: 'Multi-Channel',
}

const modeColors = {
  email_only: badgeColors.purple,
  linkedin_only: badgeColors.sky,
  multi_channel: badgeColors.pink,
}

const statusColors = {
  draft: badgeColors.neutral,
  active: badgeColors.success,
  paused: badgeColors.warning,
  completed: badgeColors.info,
}

export default function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Edit form state
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editCustomInstructions, setEditCustomInstructions] = useState('')
  const [editTargetPersona, setEditTargetPersona] = useState('')
  const [editPrimaryAngle, setEditPrimaryAngle] = useState('')
  const [editEmailCount, setEditEmailCount] = useState(7)
  const [editLinkedinCount, setEditLinkedinCount] = useState(4)
  const [editLinkedinFirst, setEditLinkedinFirst] = useState(false)
  const [editWaitForConnection, setEditWaitForConnection] = useState(true)
  const [editConnectionTimeoutHours, setEditConnectionTimeoutHours] = useState(72)
  const [editSmartleadCampaignId, setEditSmartleadCampaignId] = useState('')
  const [editHeyreachCampaignId, setEditHeyreachCampaignId] = useState('')

  useEffect(() => {
    fetchCampaign()
  }, [id])

  const fetchCampaign = async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/campaigns/${id}`)
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to load campaign')
        return
      }

      setCampaign(data.campaign)
      populateEditForm(data.campaign)
    } catch (err) {
      setError('Failed to load campaign')
    } finally {
      setLoading(false)
    }
  }

  const populateEditForm = (c: Campaign) => {
    setEditName(c.name)
    setEditDescription(c.description || '')
    setEditCustomInstructions(c.custom_instructions || '')
    setEditTargetPersona(c.target_persona || '')
    setEditPrimaryAngle(c.primary_angle || '')
    setEditEmailCount(c.email_count)
    setEditLinkedinCount(c.linkedin_count)
    setEditLinkedinFirst(c.linkedin_first)
    setEditWaitForConnection(c.wait_for_connection)
    setEditConnectionTimeoutHours(c.connection_timeout_hours)
    setEditSmartleadCampaignId(c.smartlead_campaign_id || '')
    setEditHeyreachCampaignId(c.heyreach_campaign_id || '')
  }

  const handleSave = async () => {
    if (!campaign) return
    setSaving(true)
    setError(null)

    try {
      const res = await fetch(`/api/campaigns/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName,
          description: editDescription || null,
          custom_instructions: editCustomInstructions || null,
          target_persona: editTargetPersona || null,
          primary_angle: editPrimaryAngle || null,
          email_count: editEmailCount,
          linkedin_count: editLinkedinCount,
          linkedin_first: editLinkedinFirst,
          wait_for_connection: editWaitForConnection,
          connection_timeout_hours: editConnectionTimeoutHours,
          smartlead_campaign_id: editSmartleadCampaignId || null,
          heyreach_campaign_id: editHeyreachCampaignId || null,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to save changes')
        return
      }

      setCampaign(data.campaign)
      setEditing(false)
    } catch (err) {
      setError('Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  const handleStatusChange = async (newStatus: 'active' | 'paused') => {
    if (!campaign) return
    setSaving(true)
    setError(null)

    try {
      const updates: Record<string, unknown> = { status: newStatus }
      if (newStatus === 'active' && !campaign.activated_at) {
        updates.activated_at = new Date().toISOString()
      }

      const res = await fetch(`/api/campaigns/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to update status')
        return
      }

      setCampaign(data.campaign)
    } catch (err) {
      setError('Failed to update status')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    setError(null)

    try {
      const res = await fetch(`/api/campaigns/${id}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to delete campaign')
        return
      }

      router.push('/campaigns')
    } catch (err) {
      setError('Failed to delete campaign')
    } finally {
      setDeleting(false)
      setShowDeleteConfirm(false)
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

  if (!campaign) {
    return (
      <Shell>
        <div className="p-6 lg:p-8">
          <div className={cn(jsb.card, 'p-8 text-center')}>
            <p className="text-red-400">{error || 'Campaign not found'}</p>
            <Link href="/campaigns" className={cn(jsb.buttonSecondary, 'px-4 py-2 mt-4 inline-block')}>
              Back to Campaigns
            </Link>
          </div>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <div className="p-6 lg:p-8 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <Link href="/campaigns" className={cn(jsb.buttonGhost, 'p-2')}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </Link>
            <div>
              <div className="flex items-center gap-3">
                <h1 className={cn(jsb.heading, 'text-2xl')}>{campaign.name}</h1>
                <span className={cn(jsb.badge, modeColors[campaign.mode])}>
                  {modeLabels[campaign.mode]}
                </span>
                <span className={cn(jsb.badge, statusColors[campaign.status])}>
                  {campaign.status}
                </span>
              </div>
              <p className={jsb.subheading}>
                Brand: {campaign.brand?.name || 'Unknown'}
                {campaign.activated_at && ` • Activated ${new Date(campaign.activated_at).toLocaleDateString()}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {campaign.status === 'draft' && (
              <button
                onClick={() => handleStatusChange('active')}
                disabled={saving}
                className={cn(jsb.buttonPrimary, 'px-4 py-2')}
              >
                {saving ? 'Activating...' : 'Activate Campaign'}
              </button>
            )}
            {campaign.status === 'active' && (
              <button
                onClick={() => handleStatusChange('paused')}
                disabled={saving}
                className={cn(jsb.buttonSecondary, 'px-4 py-2')}
              >
                {saving ? 'Pausing...' : 'Pause Campaign'}
              </button>
            )}
            {campaign.status === 'paused' && (
              <button
                onClick={() => handleStatusChange('active')}
                disabled={saving}
                className={cn(jsb.buttonPrimary, 'px-4 py-2')}
              >
                {saving ? 'Resuming...' : 'Resume Campaign'}
              </button>
            )}
            {!editing && (
              <button
                onClick={() => setEditing(true)}
                className={cn(jsb.buttonSecondary, 'px-4 py-2')}
              >
                Edit
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500/30 rounded-md p-4 text-red-400">
            {error}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className={cn(jsb.card, 'p-4')}>
            <p className={jsb.label}>Total Leads</p>
            <p className="text-2xl font-bold text-white mt-1">{campaign.total_leads}</p>
          </div>
          <div className={cn(jsb.card, 'p-4')}>
            <p className={jsb.label}>Contacted</p>
            <p className="text-2xl font-bold text-white mt-1">{campaign.leads_contacted}</p>
            {campaign.total_leads > 0 && (
              <p className={jsb.subheading}>
                {Math.round((campaign.leads_contacted / campaign.total_leads) * 100)}%
              </p>
            )}
          </div>
          <div className={cn(jsb.card, 'p-4')}>
            <p className={jsb.label}>Replies</p>
            <p className="text-2xl font-bold text-cyan-400 mt-1">{campaign.leads_replied}</p>
            {campaign.leads_contacted > 0 && (
              <p className={jsb.subheading}>
                {Math.round((campaign.leads_replied / campaign.leads_contacted) * 100)}% reply rate
              </p>
            )}
          </div>
          <div className={cn(jsb.card, 'p-4')}>
            <p className={jsb.label}>Converted</p>
            <p className="text-2xl font-bold text-emerald-400 mt-1">{campaign.leads_converted}</p>
            {campaign.leads_replied > 0 && (
              <p className={jsb.subheading}>
                {Math.round((campaign.leads_converted / campaign.leads_replied) * 100)}% conversion
              </p>
            )}
          </div>
        </div>

        {editing ? (
          /* Edit Form */
          <div className="space-y-6">
            {/* Basic Info */}
            <div className={cn(jsb.card, 'p-6')}>
              <h2 className={cn(jsb.heading, 'text-lg mb-4')}>Campaign Details</h2>
              <div className="space-y-4">
                <div>
                  <label className={cn(jsb.label, 'block mb-2')}>Campaign Name *</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className={cn(jsb.input, 'w-full px-3 py-2')}
                  />
                </div>
                <div>
                  <label className={cn(jsb.label, 'block mb-2')}>Description</label>
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className={cn(jsb.input, 'w-full px-3 py-2')}
                    rows={2}
                  />
                </div>
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
                    value={editTargetPersona}
                    onChange={(e) => setEditTargetPersona(e.target.value)}
                    className={cn(jsb.input, 'w-full px-3 py-2')}
                  />
                </div>
                <div>
                  <label className={cn(jsb.label, 'block mb-2')}>Primary Angle</label>
                  <input
                    type="text"
                    value={editPrimaryAngle}
                    onChange={(e) => setEditPrimaryAngle(e.target.value)}
                    className={cn(jsb.input, 'w-full px-3 py-2')}
                  />
                </div>
              </div>
            </div>

            {/* Custom Instructions */}
            <div className={cn(jsb.card, 'p-6')}>
              <h2 className={cn(jsb.heading, 'text-lg mb-4')}>Custom Instructions</h2>
              <textarea
                value={editCustomInstructions}
                onChange={(e) => setEditCustomInstructions(e.target.value)}
                className={cn(jsb.input, 'w-full px-3 py-2')}
                rows={4}
              />
            </div>

            {/* Sequence Settings */}
            <div className={cn(jsb.card, 'p-6')}>
              <h2 className={cn(jsb.heading, 'text-lg mb-4')}>Sequence Settings</h2>
              <div className="grid grid-cols-2 gap-4">
                {campaign.mode !== 'linkedin_only' && (
                  <div>
                    <label className={cn(jsb.label, 'block mb-2')}>Email Steps</label>
                    <input
                      type="number"
                      value={editEmailCount}
                      onChange={(e) => setEditEmailCount(parseInt(e.target.value) || 7)}
                      className={cn(jsb.input, 'w-full px-3 py-2')}
                      min={1}
                      max={15}
                    />
                  </div>
                )}
                {campaign.mode !== 'email_only' && (
                  <div>
                    <label className={cn(jsb.label, 'block mb-2')}>LinkedIn Steps</label>
                    <input
                      type="number"
                      value={editLinkedinCount}
                      onChange={(e) => setEditLinkedinCount(parseInt(e.target.value) || 4)}
                      className={cn(jsb.input, 'w-full px-3 py-2')}
                      min={1}
                      max={10}
                    />
                  </div>
                )}
              </div>

              {campaign.mode === 'multi_channel' && (
                <div className="mt-4 space-y-4 pt-4 border-t border-jsb-navy-lighter">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editLinkedinFirst}
                      onChange={(e) => setEditLinkedinFirst(e.target.checked)}
                      className="rounded border-gray-600 text-jsb-pink focus:ring-jsb-pink"
                    />
                    <span className="text-gray-300">Start with LinkedIn before email</span>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editWaitForConnection}
                      onChange={(e) => setEditWaitForConnection(e.target.checked)}
                      className="rounded border-gray-600 text-jsb-pink focus:ring-jsb-pink"
                    />
                    <span className="text-gray-300">Wait for LinkedIn connection</span>
                  </label>

                  {editWaitForConnection && (
                    <div className="ml-6">
                      <label className={cn(jsb.label, 'block mb-2')}>Connection Timeout (hours)</label>
                      <input
                        type="number"
                        value={editConnectionTimeoutHours}
                        onChange={(e) => setEditConnectionTimeoutHours(parseInt(e.target.value) || 72)}
                        className={cn(jsb.input, 'w-32 px-3 py-2')}
                        min={24}
                        max={168}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Platform Integration */}
            <div className={cn(jsb.card, 'p-6')}>
              <h2 className={cn(jsb.heading, 'text-lg mb-4')}>Platform Integration</h2>
              <div className="grid grid-cols-2 gap-4">
                {campaign.mode !== 'linkedin_only' && (
                  <div>
                    <label className={cn(jsb.label, 'block mb-2')}>Smartlead Campaign ID</label>
                    <input
                      type="text"
                      value={editSmartleadCampaignId}
                      onChange={(e) => setEditSmartleadCampaignId(e.target.value)}
                      className={cn(jsb.input, 'w-full px-3 py-2')}
                    />
                  </div>
                )}
                {campaign.mode !== 'email_only' && (
                  <div>
                    <label className={cn(jsb.label, 'block mb-2')}>HeyReach Campaign ID</label>
                    <input
                      type="text"
                      value={editHeyreachCampaignId}
                      onChange={(e) => setEditHeyreachCampaignId(e.target.value)}
                      className={cn(jsb.input, 'w-full px-3 py-2')}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Edit Actions */}
            <div className="flex items-center justify-between pt-4">
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className={cn(jsb.buttonDanger, 'px-4 py-2')}
              >
                Delete Campaign
              </button>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => {
                    setEditing(false)
                    populateEditForm(campaign)
                  }}
                  className={cn(jsb.buttonSecondary, 'px-4 py-2')}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !editName}
                  className={cn(jsb.buttonPrimary, 'px-6 py-2')}
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* View Mode */
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Campaign Info */}
            <div className={cn(jsb.card, 'p-6')}>
              <h2 className={cn(jsb.heading, 'text-lg mb-4')}>Campaign Details</h2>
              <dl className="space-y-3">
                {campaign.description && (
                  <div>
                    <dt className={jsb.label}>Description</dt>
                    <dd className="text-gray-300 mt-1">{campaign.description}</dd>
                  </div>
                )}
                {campaign.target_persona && (
                  <div>
                    <dt className={jsb.label}>Target Persona</dt>
                    <dd className="text-gray-300 mt-1">{campaign.target_persona}</dd>
                  </div>
                )}
                {campaign.primary_angle && (
                  <div>
                    <dt className={jsb.label}>Primary Angle</dt>
                    <dd className="text-gray-300 mt-1">{campaign.primary_angle}</dd>
                  </div>
                )}
                <div>
                  <dt className={jsb.label}>Created</dt>
                  <dd className="text-gray-300 mt-1">
                    {new Date(campaign.created_at).toLocaleDateString()}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Sequence Settings */}
            <div className={cn(jsb.card, 'p-6')}>
              <h2 className={cn(jsb.heading, 'text-lg mb-4')}>Sequence Settings</h2>
              <dl className="space-y-3">
                {campaign.mode !== 'linkedin_only' && (
                  <div>
                    <dt className={jsb.label}>Email Steps</dt>
                    <dd className="text-gray-300 mt-1">{campaign.email_count}</dd>
                  </div>
                )}
                {campaign.mode !== 'email_only' && (
                  <div>
                    <dt className={jsb.label}>LinkedIn Steps</dt>
                    <dd className="text-gray-300 mt-1">{campaign.linkedin_count}</dd>
                  </div>
                )}
                {campaign.mode === 'multi_channel' && (
                  <>
                    <div>
                      <dt className={jsb.label}>Channel Priority</dt>
                      <dd className="text-gray-300 mt-1">
                        {campaign.linkedin_first ? 'LinkedIn first' : 'Email first'}
                      </dd>
                    </div>
                    <div>
                      <dt className={jsb.label}>Connection Behavior</dt>
                      <dd className="text-gray-300 mt-1">
                        {campaign.wait_for_connection
                          ? `Wait up to ${campaign.connection_timeout_hours}h for connection`
                          : 'Send messages without waiting'}
                      </dd>
                    </div>
                  </>
                )}
              </dl>
            </div>

            {/* Custom Instructions */}
            {campaign.custom_instructions && (
              <div className={cn(jsb.card, 'p-6 lg:col-span-2')}>
                <h2 className={cn(jsb.heading, 'text-lg mb-4')}>Custom Instructions</h2>
                <p className="text-gray-300 whitespace-pre-wrap">{campaign.custom_instructions}</p>
              </div>
            )}

            {/* Platform Integration */}
            <div className={cn(jsb.card, 'p-6 lg:col-span-2')}>
              <h2 className={cn(jsb.heading, 'text-lg mb-4')}>Platform Integration</h2>
              <div className="flex items-center gap-8">
                {campaign.mode !== 'linkedin_only' && (
                  <div className="flex items-center gap-3">
                    <span className={cn(
                      'w-3 h-3 rounded-full',
                      campaign.smartlead_campaign_id ? 'bg-emerald-400' : 'bg-gray-600'
                    )}></span>
                    <div>
                      <p className="text-gray-300">Smartlead</p>
                      <p className={jsb.subheading}>
                        {campaign.smartlead_campaign_id
                          ? `Campaign #${campaign.smartlead_campaign_id}`
                          : 'Not connected'}
                      </p>
                    </div>
                  </div>
                )}
                {campaign.mode !== 'email_only' && (
                  <div className="flex items-center gap-3">
                    <span className={cn(
                      'w-3 h-3 rounded-full',
                      campaign.heyreach_campaign_id ? 'bg-emerald-400' : 'bg-gray-600'
                    )}></span>
                    <div>
                      <p className="text-gray-300">HeyReach</p>
                      <p className={jsb.subheading}>
                        {campaign.heyreach_campaign_id
                          ? `Campaign #${campaign.heyreach_campaign_id}`
                          : 'Not connected'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className={cn(jsb.card, 'p-6 max-w-md mx-4')}>
              <h3 className={cn(jsb.heading, 'text-lg mb-2')}>Delete Campaign?</h3>
              <p className={jsb.subheading}>
                Are you sure you want to delete "{campaign.name}"? This action cannot be undone.
              </p>
              <div className="flex items-center justify-end gap-4 mt-6">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className={cn(jsb.buttonSecondary, 'px-4 py-2')}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className={cn(jsb.buttonDanger, 'px-4 py-2')}
                >
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Shell>
  )
}
