'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { SourceBadge } from '../../components/ui/SourceBadge'
import { IntentScoreBadge } from '../../components/ui/IntentScoreBadge'
import { QualificationBadge } from '../../components/ui/QualificationBadge'
import { LoadingState } from '../../components/ui/LoadingSpinner'
import { NoLeadsEmptyState } from '../../components/ui/EmptyState'
import { LeadKanban } from '../../components/leads/LeadKanban'

type ViewMode = 'list' | 'kanban'

interface Lead {
  id: string
  first_name: string
  last_name: string
  email: string
  company_name: string
  job_title: string | null
  qualification_decision: string | null
  status: string
  source: string | null
  intent_score: number | null
  created_at: string
  research?: {
    relationship_type?: string
    persona_type?: string
  }
}

interface ColumnConfig {
  key: string
  label: string
  minWidth: number
  defaultWidth: number
}

const QUALIFICATION_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'disqualified', label: 'Disqualified' },
  { value: 'pending', label: 'Pending' },
]

const STAGE_FILTERS = [
  { value: 'all', label: 'All Stages' },
  { value: 'new', label: 'New' },
  { value: 'researched', label: 'Researched' },
  { value: 'sequence_ready', label: 'Sequence Ready' },
  { value: 'deployed', label: 'Deployed' },
  { value: 'replied', label: 'Replied' },
]

const SOURCE_FILTERS = [
  { value: 'all', label: 'All Sources' },
  { value: 'jsb_site_pixel', label: 'JSB Site Pixel' },
  { value: 'intent_data', label: 'Intent Data' },
  { value: 'audience_lab', label: 'Audience Lab' },
  { value: 'apollo_search', label: 'Apollo Search' },
  { value: 'linkedin_search', label: 'LinkedIn Search' },
]

const DEFAULT_COLUMNS: ColumnConfig[] = [
  { key: 'name', label: 'Name', minWidth: 150, defaultWidth: 200 },
  { key: 'company', label: 'Company', minWidth: 120, defaultWidth: 200 },
  { key: 'title', label: 'Title', minWidth: 100, defaultWidth: 180 },
  { key: 'score', label: 'Score', minWidth: 60, defaultWidth: 80 },
  { key: 'qualified', label: 'ICP Fit', minWidth: 80, defaultWidth: 100 },
  { key: 'stage', label: 'Pipeline', minWidth: 80, defaultWidth: 110 },
  { key: 'source', label: 'Source', minWidth: 80, defaultWidth: 100 },
  { key: 'relationship', label: 'Relationship', minWidth: 80, defaultWidth: 120 },
  { key: 'created', label: 'Created', minWidth: 80, defaultWidth: 100 },
]

function ResizableHeader({
  column,
  width,
  onResize
}: {
  column: ColumnConfig
  width: number
  onResize: (key: string, width: number) => void
}) {
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    startXRef.current = e.clientX
    startWidthRef.current = width

    const handleMouseMove = (e: MouseEvent) => {
      const diff = e.clientX - startXRef.current
      const newWidth = Math.max(column.minWidth, startWidthRef.current + diff)
      onResize(column.key, newWidth)
    }

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [column.key, column.minWidth, width, onResize])

  return (
    <th
      style={{ width: `${width}px`, minWidth: `${column.minWidth}px` }}
      className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider relative group"
    >
      {column.label}
      <div
        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-jsb-pink bg-transparent group-hover:bg-jsb-navy-lighter"
        onMouseDown={handleMouseDown}
      />
    </th>
  )
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [qualificationFilter, setQualificationFilter] = useState('all')
  const [stageFilter, setStageFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() =>
    DEFAULT_COLUMNS.reduce((acc, col) => ({ ...acc, [col.key]: col.defaultWidth }), {})
  )

  const handleColumnResize = useCallback((key: string, width: number) => {
    setColumnWidths(prev => ({ ...prev, [key]: width }))
  }, [])

  useEffect(() => {
    fetchLeads()
  }, [qualificationFilter, stageFilter, sourceFilter])

  async function fetchLeads() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (qualificationFilter !== 'all') params.set('qualification', qualificationFilter)
      if (stageFilter !== 'all') params.set('status', stageFilter)
      if (sourceFilter !== 'all') params.set('source', sourceFilter)
      if (searchQuery) params.set('search', searchQuery)

      const res = await fetch(`/api/leads?${params}`)
      const data = await res.json()
      setLeads(data.leads || [])
    } catch (error) {
      console.error('Failed to fetch leads:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredLeads = searchQuery
    ? leads.filter(
        (lead) =>
          lead.first_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          lead.last_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          lead.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
          lead.company_name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : leads

  return (
    <div>
      {/* Header */}
      <div className="sm:flex sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Leads</h1>
          <p className="mt-1 text-sm text-gray-400">
            Manage your leads and email sequences
          </p>
        </div>
        <div className="mt-4 sm:mt-0 flex items-center gap-4">
          <span className="text-sm text-gray-400">
            {filteredLeads.length} leads
          </span>
          {/* View Toggle */}
          <div className="flex items-center bg-jsb-navy-lighter rounded-lg p-1">
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                viewMode === 'list'
                  ? 'bg-jsb-navy-light text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
              </svg>
              List
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                viewMode === 'kanban'
                  ? 'bg-jsb-navy-light text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125z" />
              </svg>
              Kanban
            </button>
          </div>
          <button className="px-4 py-2 bg-jsb-pink text-white text-sm font-medium rounded-md hover:bg-jsb-pink-hover transition-colors">
            Add Lead
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 space-y-4">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Qualification filter */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-2">Qualification</label>
            <div className="flex flex-wrap gap-2">
              {QUALIFICATION_FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  onClick={() => setQualificationFilter(filter.value)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    qualificationFilter === filter.value
                      ? 'bg-jsb-pink text-white'
                      : 'bg-jsb-navy-lighter text-gray-300 hover:bg-jsb-navy-light border border-jsb-navy-lighter'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          {/* Stage filter */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-2">Stage</label>
            <div className="flex flex-wrap gap-2">
              {STAGE_FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  onClick={() => setStageFilter(filter.value)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    stageFilter === filter.value
                      ? 'bg-jsb-pink text-white'
                      : 'bg-jsb-navy-lighter text-gray-300 hover:bg-jsb-navy-light border border-jsb-navy-lighter'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          {/* Source filter */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-2">Source</label>
            <div className="flex flex-wrap gap-2">
              {SOURCE_FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  onClick={() => setSourceFilter(filter.value)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    sourceFilter === filter.value
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

        {/* Search */}
        <div className="max-w-md">
          <input
            type="text"
            placeholder="Search by name, email, or company..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 bg-jsb-navy-light border border-jsb-navy-lighter rounded-md text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-jsb-pink focus:border-transparent"
          />
        </div>
      </div>

      {/* Content */}
      {viewMode === 'kanban' ? (
        <LeadKanban leads={filteredLeads} loading={loading} />
      ) : (
      <div className="bg-jsb-navy-light border border-jsb-navy-lighter rounded-lg overflow-hidden">
        {loading ? (
          <LoadingState message="Loading leads..." />
        ) : filteredLeads.length === 0 ? (
          <NoLeadsEmptyState />
        ) : (
          <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-400px)]">
            <table className="w-full divide-y divide-jsb-navy-lighter" style={{ minWidth: 'max-content' }}>
              <thead className="bg-jsb-navy-lighter sticky top-0 z-10">
                <tr>
                  {DEFAULT_COLUMNS.map((col) => (
                    <ResizableHeader
                      key={col.key}
                      column={col}
                      width={columnWidths[col.key]}
                      onResize={handleColumnResize}
                    />
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-jsb-navy-lighter">
                {filteredLeads.map((lead) => (
                  <tr
                    key={lead.id}
                    className="hover:bg-jsb-navy-lighter cursor-pointer transition-colors"
                  >
                    <td style={{ width: columnWidths.name }} className="px-4 py-3 whitespace-nowrap">
                      <Link href={`/leads/${lead.id}`} className="block">
                        <div className="text-sm font-medium text-white truncate">
                          {lead.first_name} {lead.last_name}
                        </div>
                        <div className="text-sm text-gray-400 truncate">{lead.email}</div>
                      </Link>
                    </td>
                    <td style={{ width: columnWidths.company }} className="px-4 py-3 whitespace-nowrap">
                      <Link href={`/leads/${lead.id}`} className="block">
                        <div className="text-sm text-gray-300 truncate">{lead.company_name}</div>
                      </Link>
                    </td>
                    <td style={{ width: columnWidths.title }} className="px-4 py-3 whitespace-nowrap">
                      <Link href={`/leads/${lead.id}`} className="block">
                        <div className="text-sm text-gray-400 truncate">
                          {lead.job_title || '-'}
                        </div>
                      </Link>
                    </td>
                    <td style={{ width: columnWidths.score }} className="px-4 py-3 whitespace-nowrap">
                      <Link href={`/leads/${lead.id}`} className="block">
                        <IntentScoreBadge score={lead.intent_score} />
                      </Link>
                    </td>
                    <td style={{ width: columnWidths.qualified }} className="px-4 py-3 whitespace-nowrap">
                      <Link href={`/leads/${lead.id}`} className="block">
                        <QualificationBadge decision={lead.qualification_decision} score={lead.intent_score} />
                      </Link>
                    </td>
                    <td style={{ width: columnWidths.stage }} className="px-4 py-3 whitespace-nowrap">
                      <Link href={`/leads/${lead.id}`} className="block">
                        <StatusBadge status={lead.status} />
                      </Link>
                    </td>
                    <td style={{ width: columnWidths.source }} className="px-4 py-3 whitespace-nowrap">
                      <Link href={`/leads/${lead.id}`} className="block">
                        <SourceBadge source={lead.source || 'jsb_site_pixel'} />
                      </Link>
                    </td>
                    <td style={{ width: columnWidths.relationship }} className="px-4 py-3 whitespace-nowrap">
                      <Link href={`/leads/${lead.id}`} className="block">
                        <div className="text-sm text-gray-400 truncate">
                          {lead.research?.relationship_type?.replace('_', ' ') || '-'}
                        </div>
                      </Link>
                    </td>
                    <td style={{ width: columnWidths.created }} className="px-4 py-3 whitespace-nowrap">
                      <Link href={`/leads/${lead.id}`} className="block">
                        <div className="text-sm text-gray-400">
                          {new Date(lead.created_at).toLocaleDateString()}
                        </div>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}
    </div>
  )
}
