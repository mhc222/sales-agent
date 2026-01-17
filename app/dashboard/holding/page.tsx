'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Shell } from '@/components/layout/Shell'
import { LoadingState } from '@/components/ui/LoadingSpinner'
import { cn } from '@/lib/styles'

interface HoldingLead {
  id: string
  name: string
  email: string
  company: string
  title: string | null
  source: string | null
  heldAt: string
  triggerScore: number
  triggerTier: string
  missingTriggers: string[]
  reasons: string[]
  strongestTrigger: string | null
  nextEvaluation: string | null
  daysUntilEval: number | null
  intentScore: number | null
  intentTier: string | null
  personaType: string | null
}

interface Stats {
  total: number
  avgScore: number
  nearThreshold: number
  byTier: {
    nurture: number
    hold: number
  }
}

interface HoldingData {
  leads: HoldingLead[]
  stats: Stats
}

function TriggerScoreBadge({ score }: { score: number }) {
  const getColor = () => {
    if (score >= 50) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
    if (score >= 40) return 'bg-amber-500/20 text-amber-400 border-amber-500/30'
    if (score >= 25) return 'bg-orange-500/20 text-orange-400 border-orange-500/30'
    return 'bg-red-500/20 text-red-400 border-red-500/30'
  }

  return (
    <span
      className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border', getColor())}
    >
      {score}/100
    </span>
  )
}

function TierBadge({ tier }: { tier: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    immediate: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', label: 'Immediate' },
    this_week: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'This Week' },
    nurture: { bg: 'bg-amber-500/20', text: 'text-amber-400', label: 'Nurture' },
    hold: { bg: 'bg-gray-500/20', text: 'text-gray-400', label: 'Hold' },
  }
  const { bg, text, label } = config[tier] || config.hold

  return <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium', bg, text)}>{label}</span>
}

function formatTimeAgo(timestamp: string): string {
  const now = new Date()
  const then = new Date(timestamp)
  const diff = now.getTime() - then.getTime()

  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return then.toLocaleDateString()
}

export default function HoldingLeadsPage() {
  const [data, setData] = useState<HoldingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<'score' | 'date'>('score')
  const [filterTier, setFilterTier] = useState<'all' | 'nurture' | 'hold'>('all')

  useEffect(() => {
    fetchHoldingLeads()
  }, [])

  async function fetchHoldingLeads() {
    try {
      const res = await fetch('/api/dashboard/holding')
      if (!res.ok) throw new Error('Failed to fetch holding leads')
      const json = await res.json()
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <LoadingState message="Loading holding leads..." />
  }

  if (error) {
    return (
      <Shell>
        <div className="p-6 lg:p-8">
          <div className="flex flex-col items-center justify-center py-12">
            <p className="text-red-400">{error}</p>
            <button
              onClick={() => {
                setLoading(true)
                setError(null)
                fetchHoldingLeads()
              }}
              className="mt-4 px-4 py-2 bg-jsb-pink text-white rounded-md hover:bg-jsb-pink-hover"
            >
              Retry
            </button>
          </div>
        </div>
      </Shell>
    )
  }

  if (!data) return null

  const { leads, stats } = data

  // Filter and sort leads
  let filteredLeads = [...leads]
  if (filterTier !== 'all') {
    filteredLeads = filteredLeads.filter((l) => l.triggerTier === filterTier)
  }
  if (sortBy === 'score') {
    filteredLeads.sort((a, b) => b.triggerScore - a.triggerScore)
  } else {
    filteredLeads.sort((a, b) => new Date(b.heldAt).getTime() - new Date(a.heldAt).getTime())
  }

  return (
    <Shell>
      <div className="p-6 lg:p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <Link href="/dashboard" className="text-gray-400 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                </svg>
              </Link>
              <h1 className="text-2xl font-bold text-white">Holding Leads</h1>
            </div>
            <p className="text-sm text-gray-400 mt-1">
              Leads waiting for stronger triggers before outreach
            </p>
          </div>
          <button
            onClick={() => {
              setLoading(true)
              fetchHoldingLeads()
            }}
            className="flex items-center gap-2 px-3 py-2 bg-jsb-navy-lighter text-gray-300 rounded-md hover:bg-jsb-navy-light transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
              />
            </svg>
            Refresh
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-jsb-navy-light border border-jsb-navy-lighter rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-500/20 rounded-lg">
                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{stats.total}</p>
                <p className="text-xs text-gray-400">Total Holding</p>
              </div>
            </div>
          </div>

          <div className="bg-jsb-navy-light border border-jsb-navy-lighter rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                </svg>
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{stats.avgScore}</p>
                <p className="text-xs text-gray-400">Avg Trigger Score</p>
              </div>
            </div>
          </div>

          <div className="bg-jsb-navy-light border border-jsb-navy-lighter rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/20 rounded-lg">
                <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{stats.nearThreshold}</p>
                <p className="text-xs text-gray-400">Near Threshold (40-49)</p>
              </div>
            </div>
          </div>

          <div className="bg-jsb-navy-light border border-jsb-navy-lighter rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-500/20 rounded-lg">
                <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-2xl font-bold text-white">Mon 6am</p>
                <p className="text-xs text-gray-400">Next Re-evaluation</p>
              </div>
            </div>
          </div>
        </div>

        {/* Info Banner */}
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-blue-400 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
            </svg>
            <div>
              <p className="text-sm text-blue-400 font-medium">Why are these leads on hold?</p>
              <p className="text-sm text-gray-400 mt-1">
                These leads don't have strong enough triggers (score &lt; 50) to warrant outreach yet.
                They'll be automatically re-evaluated weekly for new signals like funding, hiring, or return visits.
              </p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">Sort by:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'score' | 'date')}
              className="bg-jsb-navy-lighter border border-jsb-navy-lighter rounded-md px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-jsb-pink"
            >
              <option value="score">Trigger Score (High to Low)</option>
              <option value="date">Date Held (Recent First)</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">Filter:</span>
            <select
              value={filterTier}
              onChange={(e) => setFilterTier(e.target.value as 'all' | 'nurture' | 'hold')}
              className="bg-jsb-navy-lighter border border-jsb-navy-lighter rounded-md px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-jsb-pink"
            >
              <option value="all">All Tiers</option>
              <option value="nurture">Nurture (25-49)</option>
              <option value="hold">Hold (&lt;25)</option>
            </select>
          </div>
        </div>

        {/* Leads Table */}
        {filteredLeads.length === 0 ? (
          <div className="bg-jsb-navy-light border border-jsb-navy-lighter rounded-lg p-12 text-center">
            <svg
              className="w-12 h-12 text-gray-500 mx-auto mb-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <h3 className="text-lg font-medium text-white mb-2">No holding leads</h3>
            <p className="text-gray-400">
              All leads currently have sufficient triggers for outreach.
            </p>
          </div>
        ) : (
          <div className="bg-jsb-navy-light border border-jsb-navy-lighter rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-jsb-navy border-b border-jsb-navy-lighter">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Lead
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Score
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Tier
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Missing Triggers
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Source
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Held
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-jsb-navy-lighter">
                {filteredLeads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-jsb-navy-lighter/50 transition-colors">
                    <td className="px-4 py-4">
                      <Link href={`/leads/${lead.id}`} className="block">
                        <p className="text-sm font-medium text-white hover:text-jsb-pink transition-colors">
                          {lead.name}
                        </p>
                        <p className="text-xs text-gray-400">
                          {lead.title ? `${lead.title} @ ` : ''}
                          {lead.company}
                        </p>
                      </Link>
                    </td>
                    <td className="px-4 py-4">
                      <TriggerScoreBadge score={lead.triggerScore} />
                    </td>
                    <td className="px-4 py-4">
                      <TierBadge tier={lead.triggerTier} />
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {lead.missingTriggers.slice(0, 2).map((trigger, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-jsb-navy-lighter text-gray-400"
                          >
                            {trigger}
                          </span>
                        ))}
                        {lead.missingTriggers.length > 2 && (
                          <span className="text-xs text-gray-500">
                            +{lead.missingTriggers.length - 2} more
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-xs text-gray-400 capitalize">{lead.source || 'unknown'}</span>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-xs text-gray-400">{formatTimeAgo(lead.heldAt)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Legend */}
        <div className="bg-jsb-navy-light border border-jsb-navy-lighter rounded-lg p-4">
          <h3 className="text-sm font-medium text-white mb-3">Trigger Score Thresholds</h3>
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-emerald-500/40"></div>
              <span className="text-gray-400">50+ = Ready for Outreach</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-amber-500/40"></div>
              <span className="text-gray-400">40-49 = Near Threshold</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-orange-500/40"></div>
              <span className="text-gray-400">25-39 = Nurture</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-red-500/40"></div>
              <span className="text-gray-400">&lt;25 = Hold</span>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  )
}
