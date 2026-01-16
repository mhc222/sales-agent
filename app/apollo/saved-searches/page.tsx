'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Shell } from '@/components/layout/Shell'
import { jsb, cn, badgeColors } from '@/lib/styles'

interface SavedSearch {
  id: string
  name: string
  description: string | null
  search_params: {
    jobTitles?: string[]
    industry?: string
    locations?: string[]
    employeeRange?: { min: number; max: number }
  }
  nl_query: string | null
  schedule_cron: string | null
  enabled: boolean
  last_run_at: string | null
  last_result_count: number
  created_at: string
}

export default function SavedSearchesPage() {
  const [searches, setSearches] = useState<SavedSearch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)

  useEffect(() => {
    fetchSearches()
  }, [])

  const fetchSearches = async () => {
    try {
      const res = await fetch('/api/apollo/saved-searches')
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to load searches')
        return
      }

      setSearches(data.searches || [])
    } catch (err) {
      setError('Failed to load saved searches')
    } finally {
      setLoading(false)
    }
  }

  const handleToggleEnabled = async (searchId: string, enabled: boolean) => {
    setToggling(searchId)

    try {
      const res = await fetch(`/api/apollo/saved-searches/${searchId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })

      if (res.ok) {
        setSearches((prev) =>
          prev.map((s) => (s.id === searchId ? { ...s, enabled } : s))
        )
      }
    } catch (err) {
      // Ignore
    } finally {
      setToggling(null)
    }
  }

  const handleDelete = async (searchId: string) => {
    if (!confirm('Are you sure you want to delete this saved search?')) return

    setDeleting(searchId)

    try {
      const res = await fetch(`/api/apollo/saved-searches/${searchId}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        setSearches((prev) => prev.filter((s) => s.id !== searchId))
      }
    } catch (err) {
      // Ignore
    } finally {
      setDeleting(null)
    }
  }

  const formatLastRun = (dateStr: string | null) => {
    if (!dateStr) return 'Never'
    const date = new Date(dateStr)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    return `${diffDays} days ago`
  }

  const formatSchedule = (cron: string | null) => {
    if (!cron) return 'Manual'
    // Parse simple daily cron
    if (cron.startsWith('0 ')) {
      const hour = parseInt(cron.split(' ')[1])
      return `Daily ${hour}:00 UTC`
    }
    return cron
  }

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
              Loading saved searches...
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
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Link href="/apollo" className="text-gray-400 hover:text-white transition-colors">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <h1 className={cn(jsb.heading, 'text-2xl')}>Saved Searches</h1>
            </div>
            <p className="text-gray-400">Manage your saved Apollo searches and schedules</p>
          </div>
          <Link
            href="/apollo"
            className={cn(jsb.buttonPrimary, 'px-4 py-2 flex items-center gap-2')}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New Search
          </Link>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/30">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Empty State */}
        {searches.length === 0 ? (
          <div className={cn(jsb.card, 'p-12 text-center')}>
            <div className="w-16 h-16 mx-auto bg-jsb-navy-lighter rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            </div>
            <h3 className={cn(jsb.heading, 'text-lg mb-2')}>No saved searches</h3>
            <p className="text-gray-500 mb-4">
              Save your Apollo searches to run them again or schedule automatic imports
            </p>
            <Link href="/apollo" className={cn(jsb.buttonPrimary, 'px-4 py-2 inline-flex items-center gap-2')}>
              Create your first search
            </Link>
          </div>
        ) : (
          /* Searches Table */
          <div className={cn(jsb.card, 'overflow-hidden')}>
            <table className={jsb.table}>
              <thead className={jsb.tableHeader}>
                <tr>
                  <th className={jsb.tableHeaderCell}>Name</th>
                  <th className={jsb.tableHeaderCell}>Filters</th>
                  <th className={jsb.tableHeaderCell}>Schedule</th>
                  <th className={jsb.tableHeaderCell}>Last Run</th>
                  <th className={jsb.tableHeaderCell}>Results</th>
                  <th className={jsb.tableHeaderCell}>Status</th>
                  <th className={cn(jsb.tableHeaderCell, 'w-20')}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {searches.map((search) => (
                  <tr key={search.id} className={jsb.tableRow}>
                    <td className={jsb.tableCell}>
                      <div>
                        <p className={jsb.heading}>{search.name}</p>
                        {search.description && (
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{search.description}</p>
                        )}
                      </div>
                    </td>
                    <td className={jsb.tableCell}>
                      <div className="text-xs text-gray-400 space-y-0.5">
                        {(() => {
                          const titles = search.search_params.jobTitles
                          if (!titles || titles.length === 0) return null
                          return (
                            <div className="line-clamp-1">
                              <span className="text-gray-500">Titles:</span>{' '}
                              {titles.slice(0, 2).join(', ')}
                              {titles.length > 2 && ` +${titles.length - 2}`}
                            </div>
                          )
                        })()}
                        {search.search_params.industry && (
                          <div>
                            <span className="text-gray-500">Industry:</span> {search.search_params.industry}
                          </div>
                        )}
                        {(() => {
                          const locs = search.search_params.locations
                          if (!locs || locs.length === 0) return null
                          return (
                            <div className="line-clamp-1">
                              <span className="text-gray-500">Location:</span>{' '}
                              {locs.join(', ')}
                            </div>
                          )
                        })()}
                      </div>
                    </td>
                    <td className={jsb.tableCell}>
                      <span className={cn(
                        jsb.badge,
                        search.schedule_cron ? badgeColors.info : badgeColors.neutral
                      )}>
                        {formatSchedule(search.schedule_cron)}
                      </span>
                    </td>
                    <td className={jsb.tableCell}>
                      <span className="text-gray-400">{formatLastRun(search.last_run_at)}</span>
                    </td>
                    <td className={jsb.tableCell}>
                      <span className={cn(jsb.heading)}>{search.last_result_count || '-'}</span>
                    </td>
                    <td className={jsb.tableCell}>
                      <button
                        onClick={() => handleToggleEnabled(search.id, !search.enabled)}
                        disabled={toggling === search.id}
                        className={cn(
                          jsb.badge,
                          search.enabled ? badgeColors.success : badgeColors.neutral,
                          'cursor-pointer hover:opacity-80 transition-opacity'
                        )}
                      >
                        {toggling === search.id ? '...' : search.enabled ? 'Enabled' : 'Disabled'}
                      </button>
                    </td>
                    <td className={jsb.tableCell}>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/apollo?search=${search.id}`}
                          className="text-gray-400 hover:text-white transition-colors"
                          title="Run search"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </Link>
                        <button
                          onClick={() => handleDelete(search.id)}
                          disabled={deleting === search.id}
                          className="text-gray-400 hover:text-red-400 transition-colors"
                          title="Delete search"
                        >
                          {deleting === search.id ? (
                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Shell>
  )
}
