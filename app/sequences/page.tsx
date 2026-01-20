'use client'

import { Shell } from '@/components/layout/Shell'
import { useEffect, useState, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { LoadingState } from '../../components/ui/LoadingSpinner'
import { NoSequencesEmptyState } from '../../components/ui/EmptyState'
import { cn, badgeColors } from '../../lib/styles'

export const dynamic = 'force-dynamic'

interface Sequence {
  id: string
  leadId: string
  leadName: string
  leadEmail: string
  company: string
  jobTitle: string | null
  status: string
  reviewStatus: string
  reviewAttempts: number
  strategy: {
    primaryAngle?: string
    toneUsed?: string
  } | null
  createdAt: string
  approvedAt: string | null
  deployedAt: string | null
}

const REVIEW_STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'needs_review', label: 'Needs Review' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
]

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'deployed', label: 'Deployed' },
  { value: 'completed', label: 'Completed' },
]

function ReviewStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: badgeColors.warning,
    approved: badgeColors.success,
    revision_needed: badgeColors.orange,
    rejected: badgeColors.error,
    human_review: badgeColors.orange,
  }

  const labels: Record<string, string> = {
    pending: 'Pending',
    approved: 'Approved',
    revision_needed: 'Needs Revision',
    rejected: 'Rejected',
    human_review: 'Human Review',
  }

  return (
    <span className={cn('px-2 py-1 text-xs font-medium rounded-full', colors[status] || badgeColors.neutral)}>
      {labels[status] || status}
    </span>
  )
}

function formatTimeAgo(timestamp: string): string {
  const now = new Date()
  const then = new Date(timestamp)
  const diff = now.getTime() - then.getTime()

  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return then.toLocaleDateString()
}

function SequencesContent() {
  const searchParams = useSearchParams()
  const [sequences, setSequences] = useState<Sequence[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || 'all')
  const [reviewFilter, setReviewFilter] = useState(searchParams.get('review') || 'all')

  useEffect(() => {
    fetchSequences()
  }, [statusFilter, reviewFilter])

  async function fetchSequences() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (reviewFilter !== 'all') params.set('review_status', reviewFilter)

      const res = await fetch(`/api/sequences?${params}`)
      const data = await res.json()
      setSequences(data.sequences || [])
    } catch (error) {
      console.error('Failed to fetch sequences:', error)
    } finally {
      setLoading(false)
    }
  }

  const needsReviewCount = sequences.filter(
    s => ['pending', 'revision_needed', 'human_review'].includes(s.reviewStatus)
  ).length

  return (
    <div>
      {/* Header */}
      <div className="sm:flex sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Sequences</h1>
          <p className="mt-1 text-sm text-gray-400">
            Review and manage email sequences
          </p>
        </div>
        <div className="mt-4 sm:mt-0 flex items-center gap-4">
          {needsReviewCount > 0 && (
            <div className="px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-md">
              <span className="text-sm text-amber-400 font-medium">
                {needsReviewCount} need{needsReviewCount !== 1 ? '' : 's'} review
              </span>
            </div>
          )}
          <span className="text-sm text-gray-400">
            {sequences.length} sequences
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 space-y-4">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Review Status filter */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-2">Review Status</label>
            <div className="flex flex-wrap gap-2">
              {REVIEW_STATUS_FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  onClick={() => setReviewFilter(filter.value)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    reviewFilter === filter.value
                      ? 'bg-jsb-pink text-white'
                      : 'bg-jsb-navy-lighter text-gray-300 hover:bg-jsb-navy-light border border-jsb-navy-lighter'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          {/* Status filter */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-2">Sequence Status</label>
            <div className="flex flex-wrap gap-2">
              {STATUS_FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  onClick={() => setStatusFilter(filter.value)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    statusFilter === filter.value
                      ? 'bg-jsb-pink text-white'
                      : 'bg-jsb-navy-lighter text-gray-300 hover:bg-jsb-navy-light border border-jsb-navy-lighter'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Sequences List */}
      <div className="bg-jsb-navy-light border border-jsb-navy-lighter rounded-lg overflow-hidden">
        {loading ? (
          <LoadingState message="Loading sequences..." />
        ) : sequences.length === 0 ? (
          <NoSequencesEmptyState />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full divide-y divide-jsb-navy-lighter">
              <thead className="bg-jsb-navy-lighter">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Lead
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Review
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Attempts
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Angle
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-jsb-navy-lighter">
                {sequences.map((seq) => (
                  <tr
                    key={seq.id}
                    className="hover:bg-jsb-navy-lighter transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div>
                        <div className="text-sm font-medium text-white">{seq.leadName}</div>
                        <div className="text-sm text-gray-400">{seq.company}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={seq.status} />
                    </td>
                    <td className="px-4 py-3">
                      <ReviewStatusBadge status={seq.reviewStatus} />
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-400">{seq.reviewAttempts}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-400 truncate max-w-[200px] block">
                        {seq.strategy?.primaryAngle || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-400">{formatTimeAgo(seq.createdAt)}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/sequences/${seq.id}`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-jsb-pink hover:text-jsb-pink-hover transition-colors"
                      >
                        Review
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default function SequencesPage() {
  return (
    <Shell>
      <div className="p-6 lg:p-8">
        <Suspense fallback={<LoadingState message="Loading sequences..." />}>
          <SequencesContent />
        </Suspense>
      </div>
    </Shell>
  )
}
