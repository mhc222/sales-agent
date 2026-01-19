'use client'

import { useState, useEffect } from 'react'
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

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [filter, setFilter] = useState<'all' | 'active' | 'draft' | 'paused'>('all')

  useEffect(() => {
    fetchCampaigns()
  }, [])

  const fetchCampaigns = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/campaigns')
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to load campaigns')
        return
      }

      setCampaigns(data.campaigns || [])
    } catch (err) {
      setError('Failed to load campaigns')
    } finally {
      setLoading(false)
    }
  }

  const filteredCampaigns = campaigns.filter(c => {
    if (filter === 'all') return true
    return c.status === filter
  })

  const stats = {
    total: campaigns.length,
    active: campaigns.filter(c => c.status === 'active').length,
    draft: campaigns.filter(c => c.status === 'draft').length,
    totalLeads: campaigns.reduce((sum, c) => sum + c.total_leads, 0),
    totalReplies: campaigns.reduce((sum, c) => sum + c.leads_replied, 0),
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

  return (
    <Shell>
      <div className="p-6 lg:p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className={cn(jsb.heading, 'text-2xl')}>Campaigns</h1>
            <p className={jsb.subheading}>Manage your outreach campaigns across email and LinkedIn</p>
          </div>
          <Link
            href="/campaigns/new"
            className={cn(jsb.buttonPrimary, 'px-4 py-2 flex items-center gap-2')}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Campaign
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <div className={cn(jsb.card, 'p-4')}>
            <p className={jsb.label}>Total Campaigns</p>
            <p className="text-2xl font-bold text-white mt-1">{stats.total}</p>
          </div>
          <div className={cn(jsb.card, 'p-4')}>
            <p className={jsb.label}>Active</p>
            <p className="text-2xl font-bold text-emerald-400 mt-1">{stats.active}</p>
          </div>
          <div className={cn(jsb.card, 'p-4')}>
            <p className={jsb.label}>Draft</p>
            <p className="text-2xl font-bold text-gray-400 mt-1">{stats.draft}</p>
          </div>
          <div className={cn(jsb.card, 'p-4')}>
            <p className={jsb.label}>Total Leads</p>
            <p className="text-2xl font-bold text-white mt-1">{stats.totalLeads}</p>
          </div>
          <div className={cn(jsb.card, 'p-4')}>
            <p className={jsb.label}>Total Replies</p>
            <p className="text-2xl font-bold text-cyan-400 mt-1">{stats.totalReplies}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          {(['all', 'active', 'draft', 'paused'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                filter === f
                  ? 'bg-jsb-pink text-white'
                  : 'bg-jsb-navy-lighter text-gray-400 hover:text-white'
              )}
            >
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Campaign List */}
        {error ? (
          <div className={cn(jsb.card, 'p-8 text-center')}>
            <p className="text-red-400">{error}</p>
          </div>
        ) : filteredCampaigns.length === 0 ? (
          <div className={cn(jsb.card, 'p-8 text-center')}>
            <svg className="w-12 h-12 text-gray-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" />
            </svg>
            <h3 className={cn(jsb.heading, 'text-lg mb-2')}>No campaigns yet</h3>
            <p className={jsb.subheading}>Create your first campaign to start reaching out to leads</p>
            <Link
              href="/campaigns/new"
              className={cn(jsb.buttonPrimary, 'px-4 py-2 mt-4 inline-flex items-center gap-2')}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Create Campaign
            </Link>
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredCampaigns.map((campaign) => (
              <Link
                key={campaign.id}
                href={`/campaigns/${campaign.id}`}
                className={cn(jsb.cardInteractive, 'p-5 block')}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className={cn(jsb.heading, 'text-lg')}>{campaign.name}</h3>
                      <span className={cn(jsb.badge, modeColors[campaign.mode])}>
                        {modeLabels[campaign.mode]}
                      </span>
                      <span className={cn(jsb.badge, statusColors[campaign.status])}>
                        {campaign.status}
                      </span>
                    </div>
                    {campaign.description && (
                      <p className={cn(jsb.subheading, 'mb-3')}>{campaign.description}</p>
                    )}
                    <div className="flex items-center gap-6 text-sm">
                      <div>
                        <span className="text-gray-500">Brand: </span>
                        <span className="text-gray-300">{campaign.brand?.name || 'Unknown'}</span>
                      </div>
                      {campaign.target_persona && (
                        <div>
                          <span className="text-gray-500">Persona: </span>
                          <span className="text-gray-300">{campaign.target_persona}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <div className="text-center">
                      <p className="text-gray-500">Leads</p>
                      <p className="text-white font-semibold">{campaign.total_leads}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-gray-500">Contacted</p>
                      <p className="text-white font-semibold">{campaign.leads_contacted}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-gray-500">Replies</p>
                      <p className="text-cyan-400 font-semibold">{campaign.leads_replied}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-gray-500">Converted</p>
                      <p className="text-emerald-400 font-semibold">{campaign.leads_converted}</p>
                    </div>
                    <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </div>
                </div>

                {/* Platform Integration Status */}
                <div className="flex items-center gap-4 mt-4 pt-4 border-t border-jsb-navy-lighter">
                  {campaign.mode !== 'linkedin_only' && (
                    <div className="flex items-center gap-2 text-xs">
                      <span className={cn(
                        'w-2 h-2 rounded-full',
                        campaign.smartlead_campaign_id ? 'bg-emerald-400' : 'bg-gray-600'
                      )}></span>
                      <span className="text-gray-500">Smartlead</span>
                      {campaign.smartlead_campaign_id && (
                        <span className="text-gray-400">#{campaign.smartlead_campaign_id}</span>
                      )}
                    </div>
                  )}
                  {campaign.mode !== 'email_only' && (
                    <div className="flex items-center gap-2 text-xs">
                      <span className={cn(
                        'w-2 h-2 rounded-full',
                        campaign.heyreach_campaign_id ? 'bg-emerald-400' : 'bg-gray-600'
                      )}></span>
                      <span className="text-gray-500">HeyReach</span>
                      {campaign.heyreach_campaign_id && (
                        <span className="text-gray-400">#{campaign.heyreach_campaign_id}</span>
                      )}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Shell>
  )
}
