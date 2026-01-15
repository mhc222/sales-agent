'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { LoadingState } from '../../../components/ui/LoadingSpinner'
import { NoDataEmptyState } from '../../../components/ui/EmptyState'
import { cn, badgeColors } from '../../../lib/styles'

interface ElementPerformance {
  category: string
  elementType: string
  timesUsed: number
  openRate: number
  replyRate: number
  engagementScore: number
}

export default function PerformancePage() {
  const [elements, setElements] = useState<ElementPerformance[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState<string>('all')

  useEffect(() => {
    fetchPerformance()
  }, [])

  async function fetchPerformance() {
    try {
      const res = await fetch('/api/analytics/elements')
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setElements(data.elements || [])
    } catch (error) {
      console.error('Failed to fetch performance:', error)
    } finally {
      setLoading(false)
    }
  }

  // Get unique categories
  const categories = ['all', ...new Set(elements.map(e => e.category))]

  // Filter elements
  const filteredElements = selectedCategory === 'all'
    ? elements
    : elements.filter(e => e.category === selectedCategory)

  // Sort by engagement score
  const sortedElements = [...filteredElements].sort((a, b) => b.engagementScore - a.engagementScore)

  if (loading) {
    return <LoadingState message="Loading performance data..." />
  }

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
            <h1 className="text-2xl font-bold text-white">Element Performance</h1>
            <p className="text-sm text-gray-400 mt-1">Which content elements perform best</p>
          </div>
        </div>
      </div>

      {/* Category Filter */}
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={cn(
              'px-3 py-1.5 text-sm font-medium rounded-md transition-colors capitalize',
              selectedCategory === cat
                ? 'bg-jsb-pink text-white'
                : 'bg-jsb-navy-lighter text-gray-300 hover:bg-jsb-navy-light border border-jsb-navy-lighter'
            )}
          >
            {cat === 'all' ? 'All Categories' : cat.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Performance Table */}
      {sortedElements.length === 0 ? (
        <NoDataEmptyState title="No performance data yet" />
      ) : (
        <div className="bg-jsb-navy-light border border-jsb-navy-lighter rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-jsb-navy-lighter">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Element
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Times Used
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Open Rate
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Reply Rate
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Score
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-jsb-navy-lighter">
              {sortedElements.map((element, i) => (
                <tr key={`${element.category}-${element.elementType}`} className="hover:bg-jsb-navy-lighter/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {i < 3 && (
                        <span className={cn(
                          'flex items-center justify-center w-5 h-5 rounded-full text-xs font-medium',
                          i === 0 ? 'bg-yellow-500/20 text-yellow-400' :
                          i === 1 ? 'bg-gray-400/20 text-gray-400' :
                          'bg-amber-700/20 text-amber-600'
                        )}>
                          {i + 1}
                        </span>
                      )}
                      <span className="text-sm text-white capitalize">
                        {element.elementType.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      'px-2 py-1 text-xs font-medium rounded-full capitalize',
                      badgeColors.neutral
                    )}>
                      {element.category.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-400">
                    {element.timesUsed}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={cn(
                      'text-sm font-medium',
                      element.openRate >= 40 ? 'text-emerald-400' :
                      element.openRate >= 25 ? 'text-yellow-400' : 'text-gray-400'
                    )}>
                      {element.openRate.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={cn(
                      'text-sm font-medium',
                      element.replyRate >= 10 ? 'text-emerald-400' :
                      element.replyRate >= 5 ? 'text-yellow-400' : 'text-gray-400'
                    )}>
                      {element.replyRate.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={cn(
                      'text-sm font-bold',
                      element.engagementScore >= 70 ? 'text-emerald-400' :
                      element.engagementScore >= 50 ? 'text-yellow-400' : 'text-gray-400'
                    )}>
                      {element.engagementScore.toFixed(0)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
