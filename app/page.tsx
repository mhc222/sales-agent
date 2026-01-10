'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import Link from 'next/link'

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

// Column configuration
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

function QualificationBadge({ decision, score }: { decision: string | null, score: number | null }) {
  // If we have a score, use it; otherwise fall back to decision
  // Score 70+ = qualified, everything else = not qualified
  const isQualified = score !== null
    ? score >= 70
    : decision?.toUpperCase() === 'YES'

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
      isQualified
        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
        : 'bg-red-500/20 text-red-400 border border-red-500/30'
    }`}>
      {isQualified ? 'yes' : 'no'}
    </span>
  )
}

function StageBadge({ stage }: { stage: string }) {
  const colors: Record<string, string> = {
    new: 'bg-gray-500/20 text-gray-400 border border-gray-500/30',
    low_score: 'bg-gray-600/20 text-gray-500 border border-gray-600/30',
    qualified: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
    researched: 'bg-purple-500/20 text-purple-400 border border-purple-500/30',
    sequence_ready: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
    deployed: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
    paused: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
    cancelled: 'bg-red-500/20 text-red-400 border border-red-500/30',
    replied: 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30',
    meeting_booked: 'bg-pink-500/20 text-pink-400 border border-pink-500/30',
  }

  const labels: Record<string, string> = {
    low_score: 'low',
    qualified: 'ready',
    sequence_ready: 'seq ready',
    meeting_booked: 'booked',
  }

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${colors[stage] || 'bg-gray-500/20 text-gray-400'}`}>
      {labels[stage] || stage.replace('_', ' ')}
    </span>
  )
}

function SourceBadge({ source }: { source: string }) {
  const labels: Record<string, string> = {
    jsb_site_pixel: 'JSB Pixel',
    intent_data: 'Intent',
    audience_lab: 'Audience Lab',
    apollo_search: 'Apollo',
    linkedin_search: 'LinkedIn',
    manual: 'Manual',
  }

  const colors: Record<string, string> = {
    jsb_site_pixel: 'bg-jsb-pink/20 text-jsb-pink border border-jsb-pink/30',
    intent_data: 'bg-orange-500/20 text-orange-400 border border-orange-500/30',
    audience_lab: 'bg-teal-500/20 text-teal-400 border border-teal-500/30',
    apollo_search: 'bg-violet-500/20 text-violet-400 border border-violet-500/30',
    linkedin_search: 'bg-sky-500/20 text-sky-400 border border-sky-500/30',
    manual: 'bg-gray-500/20 text-gray-400 border border-gray-500/30',
  }

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${colors[source] || 'bg-gray-500/20 text-gray-400'}`}>
      {labels[source] || source}
    </span>
  )
}

function IntentScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-gray-500">-</span>

  const color = score >= 70
    ? 'text-emerald-400'
    : score >= 40
    ? 'text-yellow-400'
    : 'text-red-400'

  return (
    <span className={`font-medium ${color}`}>
      {score}
    </span>
  )
}

// Resizable column header component
function ResizableHeader({
  column,
  width,
  onResize
}: {
  column: ColumnConfig
  width: number
  onResize: (key: string, width: number) => void
}) {
  const headerRef = useRef<HTMLTableCellElement>(null)
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
      ref={headerRef}
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

export default function LeadsDashboard() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [qualificationFilter, setQualificationFilter] = useState('all')
  const [stageFilter, setStageFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
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

      {/* Table */}
      <div className="bg-jsb-navy-light border border-jsb-navy-lighter rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-jsb-pink"></div>
            <p className="mt-2">Loading...</p>
          </div>
        ) : filteredLeads.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No leads found</div>
        ) : (
          <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-350px)]">
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
                        <StageBadge stage={lead.status} />
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
    </div>
  )
}
