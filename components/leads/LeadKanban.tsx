'use client'

import Link from 'next/link'
import { StatusBadge } from '../ui/StatusBadge'
import { SourceBadge } from '../ui/SourceBadge'
import { IntentScoreBadge } from '../ui/IntentScoreBadge'
import { cn } from '../../lib/styles'

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

interface LeadKanbanProps {
  leads: Lead[]
  loading: boolean
}

const KANBAN_COLUMNS = [
  { key: 'new', label: 'New', color: 'border-t-blue-500' },
  { key: 'qualified', label: 'Qualified', color: 'border-t-cyan-500' },
  { key: 'researched', label: 'Researched', color: 'border-t-purple-500' },
  { key: 'sequence_ready', label: 'Sequence Ready', color: 'border-t-yellow-500' },
  { key: 'deployed', label: 'Deployed', color: 'border-t-emerald-500' },
  { key: 'replied', label: 'Replied', color: 'border-t-jsb-pink' },
  { key: 'meeting_booked', label: 'Meeting Booked', color: 'border-t-orange-500' },
]

function LeadCard({ lead }: { lead: Lead }) {
  return (
    <Link href={`/leads/${lead.id}`}>
      <div className="bg-jsb-navy border border-jsb-navy-lighter rounded-lg p-3 hover:border-jsb-navy-light transition-colors cursor-pointer group">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-white truncate group-hover:text-jsb-pink transition-colors">
              {lead.first_name} {lead.last_name}
            </div>
            <div className="text-xs text-gray-400 truncate">{lead.company_name}</div>
          </div>
          <IntentScoreBadge score={lead.intent_score} compact />
        </div>

        {lead.job_title && (
          <div className="text-xs text-gray-500 truncate mb-2">{lead.job_title}</div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          {lead.source && <SourceBadge source={lead.source} compact />}
        </div>
      </div>
    </Link>
  )
}

function KanbanColumn({
  column,
  leads
}: {
  column: typeof KANBAN_COLUMNS[0]
  leads: Lead[]
}) {
  return (
    <div className="flex-shrink-0 w-72">
      <div className={cn(
        'bg-jsb-navy-light border border-jsb-navy-lighter rounded-lg overflow-hidden border-t-4',
        column.color
      )}>
        {/* Column Header */}
        <div className="p-3 border-b border-jsb-navy-lighter">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-white">{column.label}</span>
            <span className="px-2 py-0.5 text-xs font-medium bg-jsb-navy-lighter text-gray-400 rounded-full">
              {leads.length}
            </span>
          </div>
        </div>

        {/* Cards */}
        <div className="p-2 space-y-2 max-h-[calc(100vh-350px)] overflow-y-auto">
          {leads.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-gray-500">No leads</p>
            </div>
          ) : (
            leads.map(lead => (
              <LeadCard key={lead.id} lead={lead} />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export function LeadKanban({ leads, loading }: LeadKanbanProps) {
  if (loading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {KANBAN_COLUMNS.map(column => (
          <div
            key={column.key}
            className={cn(
              'flex-shrink-0 w-72 bg-jsb-navy-light border border-jsb-navy-lighter rounded-lg border-t-4 animate-pulse',
              column.color
            )}
          >
            <div className="p-3 border-b border-jsb-navy-lighter">
              <div className="h-5 bg-jsb-navy-lighter rounded w-24" />
            </div>
            <div className="p-2 space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-24 bg-jsb-navy rounded-lg" />
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  // Group leads by status
  const groupedLeads = KANBAN_COLUMNS.reduce((acc, column) => {
    acc[column.key] = leads.filter(lead => {
      // Map lead status to column key
      if (column.key === 'new') {
        return lead.status === 'new' || lead.status === 'ingested'
      }
      return lead.status === column.key
    })
    return acc
  }, {} as Record<string, Lead[]>)

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {KANBAN_COLUMNS.map(column => (
        <KanbanColumn
          key={column.key}
          column={column}
          leads={groupedLeads[column.key] || []}
        />
      ))}
    </div>
  )
}
