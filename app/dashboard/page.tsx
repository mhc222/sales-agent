'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Shell } from '@/components/layout/Shell'
import { StatCard } from '../../components/ui/StatCard'
import { LoadingState } from '../../components/ui/LoadingSpinner'
import { statusColors, cn } from '../../lib/styles'

interface DashboardStats {
  totalLeads: number
  leadsChange: number
  deployed: number
  replies: number
  meetings: number
  pendingReview: number
  holdingLeads: number
}

interface PipelineItem {
  status: string
  label: string
  count: number
}

interface ActivityItem {
  id: string
  leadId: string
  leadName: string
  company: string
  type: string
  source: string
  summary: string
  timestamp: string
}

interface DashboardData {
  stats: DashboardStats
  pipeline: PipelineItem[]
  activity: ActivityItem[]
}

// Activity type icons
function ActivityIcon({ type }: { type: string }) {
  switch (type) {
    case 'reply_received':
      return (
        <div className="p-2 bg-cyan-500/20 rounded-lg">
          <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
          </svg>
        </div>
      )
    case 'sequence_sent':
      return (
        <div className="p-2 bg-emerald-500/20 rounded-lg">
          <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
          </svg>
        </div>
      )
    case 'research':
      return (
        <div className="p-2 bg-purple-500/20 rounded-lg">
          <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
        </div>
      )
    case 'qualification':
      return (
        <div className="p-2 bg-blue-500/20 rounded-lg">
          <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
          </svg>
        </div>
      )
    default:
      return (
        <div className="p-2 bg-jsb-navy-lighter rounded-lg">
          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
      )
  }
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

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasBrands, setHasBrands] = useState(true)

  useEffect(() => {
    checkBrandsAndFetchData()
  }, [])

  async function checkBrandsAndFetchData() {
    try {
      // First check if user has any brands
      const brandsRes = await fetch('/api/brands')
      if (!brandsRes.ok) throw new Error('Failed to fetch brands')
      const brandsData = await brandsRes.json()

      if (!brandsData.brands || brandsData.brands.length === 0) {
        setHasBrands(false)
        setLoading(false)
        return
      }

      // If brands exist, fetch dashboard stats
      const res = await fetch('/api/dashboard/stats')
      if (!res.ok) throw new Error('Failed to fetch dashboard data')
      const json = await res.json()
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <LoadingState message="Loading dashboard..." />
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-red-400">{error}</p>
        <button
          onClick={() => { setLoading(true); setError(null); checkBrandsAndFetchData() }}
          className="mt-4 px-4 py-2 bg-jsb-pink text-white rounded-md hover:bg-jsb-pink-hover"
        >
          Retry
        </button>
      </div>
    )
  }

  // Show empty state if no brands exist
  if (!hasBrands) {
    return (
      <Shell>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="max-w-2xl mx-auto text-center p-8">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-jsb-pink/10 flex items-center justify-center">
              <svg
                className="w-10 h-10 text-jsb-pink"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                />
              </svg>
            </div>
            <h2 className="text-3xl font-bold text-white mb-4">Welcome to your dashboard!</h2>
            <p className="text-gray-400 text-lg mb-8">
              Create your first brand to get started with campaigns. Each brand has its own ICP,
              integrations, and messaging.
            </p>
            <Link
              href="/brands/new"
              className="inline-flex items-center gap-2 px-8 py-4 bg-jsb-pink text-white rounded-lg hover:bg-jsb-pink-hover transition-colors text-lg font-medium"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                />
              </svg>
              Create Your First Brand
            </Link>
          </div>
        </div>
      </Shell>
    )
  }

  if (!data) return null

  const { stats, pipeline, activity } = data

  // Calculate max count for pipeline bar widths
  const maxPipelineCount = Math.max(...pipeline.map(p => p.count), 1)

  return (
    <Shell>
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-gray-400 mt-1">Pipeline overview and recent activity</p>
        </div>
        <button
          onClick={() => { setLoading(true); checkBrandsAndFetchData() }}
          className="flex items-center gap-2 px-3 py-2 bg-jsb-navy-lighter text-gray-300 rounded-md hover:bg-jsb-navy-light transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Leads"
          value={stats.totalLeads}
          change={stats.leadsChange}
          changeLabel="vs last week"
          icon={
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
          }
        />
        <StatCard
          label="Deployed"
          value={stats.deployed}
          icon={
            <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
            </svg>
          }
        />
        <StatCard
          label="Replies"
          value={stats.replies}
          icon={
            <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
            </svg>
          }
        />
        <StatCard
          label="Meetings"
          value={stats.meetings}
          icon={
            <svg className="w-5 h-5 text-jsb-pink" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
          }
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pipeline Overview */}
        <div className="lg:col-span-2 bg-jsb-navy-light border border-jsb-navy-lighter rounded-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-white">Pipeline Overview</h2>
            <Link href="/leads" className="text-sm text-jsb-pink hover:text-jsb-pink-hover transition-colors">
              View all leads →
            </Link>
          </div>
          <div className="space-y-4">
            {pipeline.map((item) => (
              <div key={item.status} className="flex items-center gap-4">
                <div className="w-24 text-sm text-gray-400">{item.label}</div>
                <div className="flex-1">
                  <div className="h-8 bg-jsb-navy rounded-md overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-md transition-all duration-500',
                        statusColors[item.status]?.replace('text-', 'bg-').replace('/20', '/40') || 'bg-gray-500/40'
                      )}
                      style={{ width: `${(item.count / maxPipelineCount) * 100}%` }}
                    />
                  </div>
                </div>
                <div className="w-12 text-right text-sm font-medium text-white">{item.count}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions & Pending Review */}
        <div className="space-y-6">
          {/* Pending Review Card */}
          {stats.pendingReview > 0 && (
            <Link href="/sequences?status=pending" className="block">
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 hover:bg-amber-500/15 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-500/20 rounded-lg">
                    <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-amber-400">
                      {stats.pendingReview} sequence{stats.pendingReview !== 1 ? 's' : ''} pending review
                    </p>
                    <p className="text-xs text-gray-400">Click to review</p>
                  </div>
                </div>
              </div>
            </Link>
          )}

          {/* Holding Leads Card */}
          {stats.holdingLeads > 0 && (
            <Link href="/dashboard/holding" className="block">
              <div className="bg-gray-500/10 border border-gray-500/20 rounded-lg p-4 hover:bg-gray-500/15 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gray-500/20 rounded-lg">
                    <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-300">
                      {stats.holdingLeads} lead{stats.holdingLeads !== 1 ? 's' : ''} on hold
                    </p>
                    <p className="text-xs text-gray-400">Waiting for stronger triggers</p>
                  </div>
                </div>
              </div>
            </Link>
          )}

          {/* Quick Links */}
          <div className="bg-jsb-navy-light border border-jsb-navy-lighter rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-400 mb-3">Quick Actions</h3>
            <div className="space-y-2">
              <Link
                href="/leads"
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-jsb-navy-lighter transition-colors"
              >
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                </svg>
                <span className="text-sm text-gray-300">View all leads</span>
              </Link>
              <Link
                href="/dashboard/holding"
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-jsb-navy-lighter transition-colors"
              >
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm text-gray-300">View holding leads</span>
              </Link>
              <Link
                href="/sequences"
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-jsb-navy-lighter transition-colors"
              >
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
                <span className="text-sm text-gray-300">Review sequences</span>
              </Link>
              <Link
                href="/analytics"
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-jsb-navy-lighter transition-colors"
              >
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                </svg>
                <span className="text-sm text-gray-300">View analytics</span>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-jsb-navy-light border border-jsb-navy-lighter rounded-lg p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Recent Activity</h2>
        {activity.length === 0 ? (
          <p className="text-gray-400 text-sm">No recent activity</p>
        ) : (
          <div className="space-y-4">
            {activity.map((item) => (
              <Link
                key={item.id}
                href={`/leads/${item.leadId}`}
                className="flex items-start gap-4 p-3 rounded-lg hover:bg-jsb-navy-lighter transition-colors"
              >
                <ActivityIcon type={item.type} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white">
                    <span className="font-medium">{item.leadName}</span>
                    <span className="text-gray-400"> @ {item.company}</span>
                  </p>
                  <p className="text-sm text-gray-400 truncate">{item.summary}</p>
                </div>
                <span className="text-xs text-gray-500 whitespace-nowrap">
                  {formatTimeAgo(item.timestamp)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
    </Shell>
  )
}
