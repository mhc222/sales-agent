'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { LoadingState } from '../../../components/ui/LoadingSpinner'
import { NoDataEmptyState } from '../../../components/ui/EmptyState'
import { cn, badgeColors } from '../../../lib/styles'

interface Pattern {
  id: string
  category: string
  pattern: string
  status: string
  confidenceScore: number
  sampleSize: number
  promotedToTemplate: boolean
  createdAt: string
  context: Record<string, unknown>
}

interface PatternsData {
  summary: {
    totalPatterns: number
    highPerformers: number
    avoidPatterns: number
    promoted: number
    experimental: number
    recentDiscoveries: number
  }
  patterns: {
    highPerformers: Pattern[]
    avoidPatterns: Pattern[]
    promoted: Pattern[]
    experimental: Pattern[]
  }
}

function PatternStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    high_performer: badgeColors.success,
    avoid: badgeColors.error,
    experimental: badgeColors.warning,
    promoted: badgeColors.info,
  }

  const labels: Record<string, string> = {
    high_performer: 'High Performer',
    avoid: 'Avoid',
    experimental: 'Experimental',
    promoted: 'Promoted',
  }

  return (
    <span className={cn('px-2 py-1 text-xs font-medium rounded-full', colors[status] || badgeColors.neutral)}>
      {labels[status] || status}
    </span>
  )
}

function ConfidenceMeter({ score }: { score: number }) {
  const getColor = () => {
    if (score >= 80) return 'bg-emerald-500'
    if (score >= 60) return 'bg-yellow-500'
    return 'bg-gray-500'
  }

  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-2 bg-jsb-navy rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', getColor())}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-xs text-gray-400">{score}%</span>
    </div>
  )
}

function PatternCard({ pattern }: { pattern: Pattern }) {
  return (
    <div className="bg-jsb-navy border border-jsb-navy-lighter rounded-lg p-4 hover:border-jsb-navy-light transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-gray-500 uppercase tracking-wider">{pattern.category}</span>
            <PatternStatusBadge status={pattern.status} />
            {pattern.promotedToTemplate && (
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-jsb-pink/20 text-jsb-pink">
                Template
              </span>
            )}
          </div>
          <p className="text-sm text-white mb-3">{pattern.pattern}</p>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span>Sample size: {pattern.sampleSize}</span>
            <span>Discovered: {new Date(pattern.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
        <div className="flex-shrink-0">
          <div className="text-xs text-gray-500 mb-1">Confidence</div>
          <ConfidenceMeter score={pattern.confidenceScore} />
        </div>
      </div>
    </div>
  )
}

export default function LearningPage() {
  const [data, setData] = useState<PatternsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'high_performer' | 'avoid' | 'experimental' | 'promoted'>('high_performer')

  useEffect(() => {
    fetchPatterns()
  }, [])

  async function fetchPatterns() {
    try {
      const res = await fetch('/api/analytics/patterns')
      if (!res.ok) throw new Error('Failed to fetch')
      const json = await res.json()
      setData(json)
    } catch (error) {
      console.error('Failed to fetch patterns:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <LoadingState message="Loading learning insights..." />
  }

  if (!data) {
    return <NoDataEmptyState title="No learning data available" />
  }

  const tabs = [
    { key: 'high_performer' as const, label: 'High Performers', count: data.summary.highPerformers, color: 'text-emerald-400' },
    { key: 'avoid' as const, label: 'Avoid', count: data.summary.avoidPatterns, color: 'text-red-400' },
    { key: 'experimental' as const, label: 'Experimental', count: data.summary.experimental, color: 'text-yellow-400' },
    { key: 'promoted' as const, label: 'Promoted', count: data.summary.promoted, color: 'text-jsb-pink' },
  ]

  const currentPatterns = {
    high_performer: data.patterns.highPerformers,
    avoid: data.patterns.avoidPatterns,
    experimental: data.patterns.experimental,
    promoted: data.patterns.promoted,
  }[activeTab]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/analytics"
            className="p-2 rounded-lg bg-jsb-navy-lighter text-gray-400 hover:text-white hover:bg-jsb-navy-light transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">Learning Insights</h1>
            <p className="text-sm text-gray-400 mt-1">Patterns discovered from engagement data</p>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-jsb-navy-light border border-jsb-navy-lighter rounded-lg p-4">
          <div className="text-2xl font-bold text-white">{data.summary.totalPatterns}</div>
          <div className="text-sm text-gray-400">Total Patterns</div>
        </div>
        <div className="bg-jsb-navy-light border border-jsb-navy-lighter rounded-lg p-4">
          <div className="text-2xl font-bold text-emerald-400">{data.summary.highPerformers}</div>
          <div className="text-sm text-gray-400">High Performers</div>
        </div>
        <div className="bg-jsb-navy-light border border-jsb-navy-lighter rounded-lg p-4">
          <div className="text-2xl font-bold text-jsb-pink">{data.summary.promoted}</div>
          <div className="text-sm text-gray-400">Promoted to Template</div>
        </div>
        <div className="bg-jsb-navy-light border border-jsb-navy-lighter rounded-lg p-4">
          <div className="text-2xl font-bold text-cyan-400">{data.summary.recentDiscoveries}</div>
          <div className="text-sm text-gray-400">This Week</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-jsb-navy-lighter">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px',
                activeTab === tab.key
                  ? 'border-jsb-pink text-white'
                  : 'border-transparent text-gray-400 hover:text-white hover:border-gray-600'
              )}
            >
              {tab.label}
              <span className={cn('ml-2', tab.color)}>({tab.count})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Pattern List */}
      {currentPatterns.length === 0 ? (
        <NoDataEmptyState title={`No ${activeTab.replace('_', ' ')} patterns yet`} />
      ) : (
        <div className="space-y-3">
          {currentPatterns.map((pattern) => (
            <PatternCard key={pattern.id} pattern={pattern} />
          ))}
        </div>
      )}
    </div>
  )
}
