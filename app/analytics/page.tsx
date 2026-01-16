'use client'

import { Shell } from '@/components/layout/Shell'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts'
import { StatCard } from '../../components/ui/StatCard'
import { LoadingState } from '../../components/ui/LoadingSpinner'
import { NoDataEmptyState } from '../../components/ui/EmptyState'

interface Metrics {
  openRate: { value: number; change: number }
  replyRate: { value: number; change: number }
  positiveReplyRate: { value: number; change: number }
  meetingRate: { value: number; change: number }
}

interface TrendPoint {
  date: string
  opens: number
  replies: number
  meetings: number
}

interface SourceStat {
  source: string
  total: number
  openRate: number
  replyRate: number
}

interface FunnelItem {
  stage: string
  count: number
}

interface AnalyticsData {
  metrics: Metrics
  trendData: TrendPoint[]
  sourceStats: SourceStat[]
  funnel: FunnelItem[]
}

const sourceLabels: Record<string, string> = {
  jsb_site_pixel: 'JSB Pixel',
  intent_data: 'Intent Data',
  audience_lab: 'Audience Lab',
  apollo_search: 'Apollo',
  linkedin_search: 'LinkedIn',
  manual: 'Manual',
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchAnalytics()
  }, [])

  async function fetchAnalytics() {
    try {
      const res = await fetch('/api/analytics/overview')
      if (!res.ok) throw new Error('Failed to fetch analytics')
      const json = await res.json()
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <LoadingState message="Loading analytics..." />
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-red-400">{error}</p>
        <button
          onClick={() => { setLoading(true); setError(null); fetchAnalytics() }}
          className="mt-4 px-4 py-2 bg-jsb-pink text-white rounded-md hover:bg-jsb-pink-hover"
        >
          Retry
        </button>
      </div>
    )
  }

  if (!data) return <NoDataEmptyState />

  const { metrics, trendData, sourceStats, funnel } = data

  // Format date for chart
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  // Calculate max for funnel
  const maxFunnelCount = Math.max(...funnel.map(f => f.count), 1)

  return (
    <Shell>
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Analytics</h1>
          <p className="text-sm text-gray-400 mt-1">Performance metrics and insights</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/analytics/performance"
            className="px-3 py-2 text-sm font-medium text-gray-400 bg-jsb-navy-lighter rounded-md hover:text-white hover:bg-jsb-navy-light transition-colors"
          >
            Element Performance
          </Link>
          <Link
            href="/analytics/learning"
            className="px-3 py-2 text-sm font-medium text-gray-400 bg-jsb-navy-lighter rounded-md hover:text-white hover:bg-jsb-navy-light transition-colors"
          >
            Learning Insights
          </Link>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Open Rate"
          value={`${metrics.openRate.value}%`}
          change={metrics.openRate.change}
          changeLabel="vs last 30d"
          icon={
            <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          }
        />
        <StatCard
          label="Reply Rate"
          value={`${metrics.replyRate.value}%`}
          change={metrics.replyRate.change}
          changeLabel="vs last 30d"
          icon={
            <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
            </svg>
          }
        />
        <StatCard
          label="Positive Reply"
          value={`${metrics.positiveReplyRate.value}%`}
          change={metrics.positiveReplyRate.change}
          changeLabel="vs last 30d"
          icon={
            <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.633 10.5c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 012.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 00.322-1.672V3a.75.75 0 01.75-.75A2.25 2.25 0 0116.5 4.5c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 01-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 00-1.423-.23H5.904M14.25 9h2.25M5.904 18.75c.083.205.173.405.27.602.197.4-.078.898-.523.898h-.908c-.889 0-1.713-.518-1.972-1.368a12 12 0 01-.521-3.507c0-1.553.295-3.036.831-4.398C3.387 10.203 4.167 9.75 5 9.75h1.053c.472 0 .745.556.5.96a8.958 8.958 0 00-1.302 4.665c0 1.194.232 2.333.654 3.375z" />
            </svg>
          }
        />
        <StatCard
          label="Meeting Rate"
          value={`${metrics.meetingRate.value}%`}
          change={metrics.meetingRate.change}
          changeLabel="vs last 30d"
          icon={
            <svg className="w-5 h-5 text-jsb-pink" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
          }
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Engagement Trend */}
        <div className="bg-jsb-navy-light border border-jsb-navy-lighter rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Engagement Trend</h2>
          {trendData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDate}
                    stroke="#6b7280"
                    fontSize={12}
                  />
                  <YAxis stroke="#6b7280" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#242b3d',
                      border: '1px solid #2d3548',
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: '#9ca3af' }}
                    labelFormatter={formatDate}
                  />
                  <Line
                    type="monotone"
                    dataKey="opens"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={false}
                    name="Opens"
                  />
                  <Line
                    type="monotone"
                    dataKey="replies"
                    stroke="#22d3ee"
                    strokeWidth={2}
                    dot={false}
                    name="Replies"
                  />
                  <Line
                    type="monotone"
                    dataKey="meetings"
                    stroke="#e91e8d"
                    strokeWidth={2}
                    dot={false}
                    name="Meetings"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-400">
              No engagement data yet
            </div>
          )}
        </div>

        {/* Pipeline Funnel */}
        <div className="bg-jsb-navy-light border border-jsb-navy-lighter rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Pipeline Funnel</h2>
          <div className="space-y-4">
            {funnel.map((item, i) => (
              <div key={item.stage} className="flex items-center gap-4">
                <div className="w-24 text-sm text-gray-400">{item.stage}</div>
                <div className="flex-1">
                  <div className="h-8 bg-jsb-navy rounded-md overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-jsb-pink to-jsb-pink-hover rounded-md transition-all duration-500"
                      style={{
                        width: `${(item.count / maxFunnelCount) * 100}%`,
                        opacity: 1 - (i * 0.15),
                      }}
                    />
                  </div>
                </div>
                <div className="w-12 text-right text-sm font-medium text-white">{item.count}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Source Performance */}
      <div className="bg-jsb-navy-light border border-jsb-navy-lighter rounded-lg p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Performance by Source</h2>
        {sourceStats.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-jsb-navy-lighter">
                  <th className="pb-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Source
                  </th>
                  <th className="pb-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Leads
                  </th>
                  <th className="pb-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Open Rate
                  </th>
                  <th className="pb-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Reply Rate
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-jsb-navy-lighter">
                {sourceStats.map((stat) => (
                  <tr key={stat.source}>
                    <td className="py-3 text-sm text-white">
                      {sourceLabels[stat.source] || stat.source}
                    </td>
                    <td className="py-3 text-sm text-gray-400 text-right">{stat.total}</td>
                    <td className="py-3 text-right">
                      <span className={`text-sm font-medium ${
                        stat.openRate >= 40 ? 'text-emerald-400' :
                        stat.openRate >= 25 ? 'text-yellow-400' : 'text-red-400'
                      }`}>
                        {stat.openRate}%
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <span className={`text-sm font-medium ${
                        stat.replyRate >= 10 ? 'text-emerald-400' :
                        stat.replyRate >= 5 ? 'text-yellow-400' : 'text-red-400'
                      }`}>
                        {stat.replyRate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-400">
            No source data available
          </div>
        )}
      </div>
    </div>
    </Shell>
  )
}
