'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

interface Lead {
  id: string
  first_name: string
  last_name: string
  email: string
  company_name: string
  job_title: string | null
  linkedin_url: string | null
  company_linkedin_url: string | null
  status: string
  created_at: string
}

interface Research {
  persona_match: {
    type: string
    decision_level: string
    confidence: number
    reasoning: string
  }
  relationship: {
    type: string
    reasoning: string
    who_they_serve: string
    opening_question: string
  }
  triggers: Array<{
    type: string
    fact: string
    content_excerpt?: string
    scores: { impact: number; recency: number; relevance: number; total: number }
  }>
  messaging_angles: Array<{
    angle: string
    triggers_used: string[]
    why_opening: string
  }>
}

interface Sequence {
  id: string
  status: string
  relationship_type: string
  persona_type: string
  pain_1: { pain: string; implication: string; solution: string; social_proof: string }
  pain_2: { pain: string; implication: string; solution: string; social_proof: string }
  thread_1: { subject: string; emails: Array<{ email_number: number; day: number; structure: string; body: string; word_count: number }> }
  thread_2: { subject: string; emails: Array<{ email_number: number; day: number; structure: string; body: string; word_count: number }> }
  created_at: string
  deployed_at: string | null
  smartlead_campaign_id?: string
}

interface SequenceStats {
  sent: number
  opens: number
  replies: number
}

interface Memory {
  id: string
  source: string
  memory_type: string
  summary: string
  content: Record<string, unknown>
  created_at: string
}

type Tab = 'overview' | 'research' | 'sequence' | 'timeline'

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    new: 'bg-gray-500/20 text-gray-300 border border-gray-500/30',
    qualified: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
    researched: 'bg-purple-500/20 text-purple-400 border border-purple-500/30',
    sequence_ready: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
    pending: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
    approved: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
    deployed: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
    paused: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
    cancelled: 'bg-red-500/20 text-red-400 border border-red-500/30',
    replied: 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30',
  }

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${colors[status] || 'bg-gray-500/20 text-gray-300'}`}>
      {status.replace('_', ' ')}
    </span>
  )
}

export default function LeadDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [lead, setLead] = useState<Lead | null>(null)
  const [research, setResearch] = useState<Research | null>(null)
  const [sequence, setSequence] = useState<Sequence | null>(null)
  const [memories, setMemories] = useState<Memory[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  useEffect(() => {
    fetchLeadData()
  }, [params.id])

  async function fetchLeadData() {
    setLoading(true)
    try {
      const res = await fetch(`/api/leads/${params.id}`)
      const data = await res.json()
      setLead(data.lead)
      setResearch(data.research)
      setSequence(data.sequence)
      setMemories(data.memories || [])
    } catch (error) {
      console.error('Failed to fetch lead:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleRerun(step: 'research' | 'sequence') {
    setActionLoading(step)
    try {
      await fetch(`/api/leads/${params.id}/rerun?step=${step}`, { method: 'POST' })
      // Refresh data after a delay
      setTimeout(fetchLeadData, 2000)
    } catch (error) {
      console.error('Failed to rerun:', error)
    } finally {
      setActionLoading(null)
    }
  }

  async function handleDeploy() {
    setActionLoading('deploy')
    try {
      await fetch(`/api/leads/${params.id}/deploy`, { method: 'POST' })
      setTimeout(fetchLeadData, 2000)
    } catch (error) {
      console.error('Failed to deploy:', error)
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-gray-400">Loading...</div>
  }

  if (!lead) {
    return <div className="p-8 text-center text-gray-400">Lead not found</div>
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'research', label: 'Research' },
    { id: 'sequence', label: 'Sequence' },
    { id: 'timeline', label: 'Timeline' },
  ]

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Link href="/" className="text-sm text-gray-400 hover:text-jsb-pink mb-2 inline-block transition-colors">
          ← Back to leads
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">
              {lead.first_name} {lead.last_name}
            </h1>
            <p className="text-gray-400">{lead.email}</p>
            <p className="text-sm text-gray-400 mt-1">
              {lead.job_title} at {lead.company_name}
            </p>
          </div>
          <StatusBadge status={lead.status} />
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-jsb-navy-lighter mb-6">
        <nav className="flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === tab.id
                  ? 'border-jsb-pink text-jsb-pink'
                  : 'border-transparent text-gray-400 hover:text-white hover:border-gray-500'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <OverviewTab lead={lead} research={research} sequence={sequence} />
      )}
      {activeTab === 'research' && (
        <ResearchTab
          research={research}
          onRerun={() => handleRerun('research')}
          loading={actionLoading === 'research'}
        />
      )}
      {activeTab === 'sequence' && (
        <SequenceTab
          sequence={sequence}
          onRerun={() => handleRerun('sequence')}
          onDeploy={handleDeploy}
          loading={actionLoading}
          leadId={params.id as string}
          onRefresh={fetchLeadData}
        />
      )}
      {activeTab === 'timeline' && <TimelineTab memories={memories} />}
    </div>
  )
}

function OverviewTab({
  lead,
  research,
  sequence,
}: {
  lead: Lead
  research: Research | null
  sequence: Sequence | null
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Lead Info */}
      <div className="bg-jsb-navy-light border border-jsb-navy-lighter rounded-lg p-6">
        <h3 className="text-lg font-medium text-white mb-4">Lead Information</h3>
        <dl className="space-y-3">
          <div>
            <dt className="text-sm text-gray-400">Email</dt>
            <dd className="text-sm text-white">{lead.email}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-400">Title</dt>
            <dd className="text-sm text-white">{lead.job_title || '-'}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-400">Company</dt>
            <dd className="text-sm text-white">{lead.company_name}</dd>
          </div>
          {lead.linkedin_url && (
            <div>
              <dt className="text-sm text-gray-400">LinkedIn</dt>
              <dd>
                <a
                  href={lead.linkedin_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-jsb-pink hover:underline"
                >
                  View Profile
                </a>
              </dd>
            </div>
          )}
          <div>
            <dt className="text-sm text-gray-400">Created</dt>
            <dd className="text-sm text-white">
              {new Date(lead.created_at).toLocaleString()}
            </dd>
          </div>
        </dl>
      </div>

      {/* Quick Stats */}
      <div className="bg-jsb-navy-light border border-jsb-navy-lighter rounded-lg p-6">
        <h3 className="text-lg font-medium text-white mb-4">Quick Stats</h3>
        <dl className="space-y-3">
          <div>
            <dt className="text-sm text-gray-400">Persona</dt>
            <dd className="text-sm text-white">
              {research?.persona_match?.type?.replace('_', ' ') || '-'}{' '}
              {research?.persona_match?.decision_level && (
                <span className="text-gray-500">
                  ({research.persona_match.decision_level})
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-gray-400">Relationship Type</dt>
            <dd className="text-sm text-white">
              {research?.relationship?.type?.replace('_', ' ') || '-'}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-gray-400">Triggers Found</dt>
            <dd className="text-sm text-white">{research?.triggers?.length || 0}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-400">Sequence Status</dt>
            <dd>
              {sequence ? (
                <StatusBadge status={sequence.status} />
              ) : (
                <span className="text-sm text-gray-400">Not generated</span>
              )}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  )
}

function ResearchTab({
  research,
  onRerun,
  loading,
}: {
  research: Research | null
  onRerun: () => void
  loading: boolean
}) {
  if (!research) {
    return (
      <div className="bg-jsb-navy-light border border-jsb-navy-lighter rounded-lg p-6 text-center">
        <p className="text-gray-400 mb-4">No research data available</p>
        <button
          onClick={onRerun}
          disabled={loading}
          className="px-4 py-2 bg-jsb-pink text-white rounded-md hover:bg-jsb-pink-hover disabled:opacity-50"
        >
          {loading ? 'Running...' : 'Run Research'}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Action button */}
      <div className="flex justify-end">
        <button
          onClick={onRerun}
          disabled={loading}
          className="px-4 py-2 bg-jsb-pink text-white rounded-md hover:bg-jsb-pink-hover disabled:opacity-50"
        >
          {loading ? 'Running...' : 'Re-run Research'}
        </button>
      </div>

      {/* Persona & Relationship */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-jsb-navy-light border border-jsb-navy-lighter rounded-lg p-6">
          <h3 className="text-lg font-medium text-white mb-4">Persona Match</h3>
          <dl className="space-y-3">
            <div>
              <dt className="text-sm text-gray-400">Type</dt>
              <dd className="text-sm font-medium text-white">
                {research.persona_match.type.replace('_', ' ')}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-gray-400">Decision Level</dt>
              <dd className="text-sm text-white">{research.persona_match.decision_level}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-400">Confidence</dt>
              <dd className="text-sm text-white">{research.persona_match.confidence}%</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-400">Reasoning</dt>
              <dd className="text-sm text-gray-300">{research.persona_match.reasoning}</dd>
            </div>
          </dl>
        </div>

        <div className="bg-jsb-navy-light border border-jsb-navy-lighter rounded-lg p-6">
          <h3 className="text-lg font-medium text-white mb-4">Relationship</h3>
          <dl className="space-y-3">
            <div>
              <dt className="text-sm text-gray-400">Type</dt>
              <dd className="text-sm font-medium text-white">
                {research.relationship.type.replace('_', ' ')}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-gray-400">Who They Serve</dt>
              <dd className="text-sm text-gray-300">{research.relationship.who_they_serve}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-400">Opening Question</dt>
              <dd className="text-sm text-gray-300 italic">
                &ldquo;{research.relationship.opening_question}&rdquo;
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Triggers */}
      <div className="bg-jsb-navy-light border border-jsb-navy-lighter rounded-lg p-6">
        <h3 className="text-lg font-medium text-white mb-4">
          Triggers ({research.triggers.length})
        </h3>
        <div className="space-y-4">
          {research.triggers.map((trigger, i) => (
            <div key={i} className="border-l-4 border-jsb-navy-lighter pl-4 py-2">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium bg-jsb-navy-lighter text-gray-300 px-2 py-0.5 rounded">
                  {trigger.type}
                </span>
                <span className="text-xs text-gray-500">
                  Score: {trigger.scores.total}/15
                </span>
              </div>
              <p className="text-sm text-white">{trigger.fact}</p>
              {trigger.content_excerpt && (
                <p className="text-sm text-gray-400 italic mt-1">
                  &ldquo;{trigger.content_excerpt}&rdquo;
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Messaging Angles */}
      <div className="bg-jsb-navy-light border border-jsb-navy-lighter rounded-lg p-6">
        <h3 className="text-lg font-medium text-white mb-4">Messaging Angles</h3>
        <div className="space-y-4">
          {research.messaging_angles.map((angle, i) => (
            <div key={i} className="border-l-4 border-jsb-pink/50 pl-4 py-2">
              <p className="text-sm font-medium text-white">{angle.angle}</p>
              <p className="text-sm text-gray-400 mt-1">{angle.why_opening}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function SequenceTab({
  sequence,
  onRerun,
  onDeploy,
  loading,
  leadId,
  onRefresh,
}: {
  sequence: Sequence | null
  onRerun: () => void
  onDeploy: () => void
  loading: string | null
  leadId: string
  onRefresh: () => void
}) {
  const [expandedEmail, setExpandedEmail] = useState<number | null>(null)
  const [stats, setStats] = useState<SequenceStats | null>(null)
  const [sequenceActionLoading, setSequenceActionLoading] = useState<string | null>(null)

  // Fetch stats when sequence is deployed
  useEffect(() => {
    if (sequence?.status === 'deployed' || sequence?.status === 'paused') {
      fetchStats()
    }
  }, [sequence?.status])

  async function fetchStats() {
    try {
      const res = await fetch(`/api/leads/${leadId}/sequence`)
      const data = await res.json()
      if (data.stats) {
        setStats(data.stats)
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    }
  }

  async function handleSequenceAction(action: 'pause' | 'resume' | 'cancel') {
    setSequenceActionLoading(action)
    try {
      const res = await fetch(`/api/leads/${leadId}/sequence`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (res.ok) {
        onRefresh()
      } else {
        const error = await res.json()
        alert(error.error || 'Failed to update sequence')
      }
    } catch (error) {
      console.error('Failed to update sequence:', error)
    } finally {
      setSequenceActionLoading(null)
    }
  }

  if (!sequence) {
    return (
      <div className="bg-jsb-navy-light border border-jsb-navy-lighter rounded-lg p-6 text-center">
        <p className="text-gray-400 mb-4">No sequence generated yet</p>
        <button
          onClick={onRerun}
          disabled={loading === 'sequence'}
          className="px-4 py-2 bg-jsb-pink text-white rounded-md hover:bg-jsb-pink-hover disabled:opacity-50"
        >
          {loading === 'sequence' ? 'Generating...' : 'Generate Sequence'}
        </button>
      </div>
    )
  }

  const allEmails = [
    ...sequence.thread_1.emails.map((e) => ({ ...e, thread: 1, subject: sequence.thread_1.subject })),
    ...sequence.thread_2.emails.map((e) => ({ ...e, thread: 2, subject: sequence.thread_2.subject })),
  ]

  return (
    <div className="space-y-6">
      {/* Status & Stats Row */}
      <div className="bg-jsb-navy-light border border-jsb-navy-lighter rounded-lg p-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div>
              <span className="text-xs text-gray-500 block">Status</span>
              <StatusBadge status={sequence.status} />
            </div>
            {sequence.deployed_at && (
              <div>
                <span className="text-xs text-gray-500 block">Deployed</span>
                <span className="text-sm text-white">
                  {new Date(sequence.deployed_at).toLocaleDateString()}
                </span>
              </div>
            )}
            {stats && (
              <>
                <div>
                  <span className="text-xs text-gray-500 block">Sent</span>
                  <span className="text-sm font-medium text-white">{stats.sent}</span>
                </div>
                <div>
                  <span className="text-xs text-gray-500 block">Opens</span>
                  <span className="text-sm font-medium text-white">{stats.opens}</span>
                </div>
                <div>
                  <span className="text-xs text-gray-500 block">Replies</span>
                  <span className="text-sm font-medium text-emerald-600">{stats.replies}</span>
                </div>
              </>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            {/* Re-generate - always available for pending/approved */}
            {(sequence.status === 'pending' || sequence.status === 'approved') && (
              <button
                onClick={onRerun}
                disabled={loading === 'sequence'}
                className="px-3 py-1.5 text-sm border border-jsb-navy-lighter text-gray-300 rounded-md hover:bg-jsb-navy-lighter disabled:opacity-50"
              >
                {loading === 'sequence' ? 'Generating...' : 'Re-generate'}
              </button>
            )}

            {/* Deploy - only if not deployed yet */}
            {(sequence.status === 'pending' || sequence.status === 'approved') && (
              <button
                onClick={onDeploy}
                disabled={loading === 'deploy'}
                className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
              >
                {loading === 'deploy' ? 'Deploying...' : 'Deploy'}
              </button>
            )}

            {/* Pause - if deployed/active */}
            {(sequence.status === 'deployed' || sequence.status === 'active') && (
              <button
                onClick={() => handleSequenceAction('pause')}
                disabled={sequenceActionLoading === 'pause'}
                className="px-3 py-1.5 text-sm bg-yellow-500 text-white rounded-md hover:bg-yellow-600 disabled:opacity-50"
              >
                {sequenceActionLoading === 'pause' ? 'Pausing...' : 'Pause'}
              </button>
            )}

            {/* Resume - if paused */}
            {sequence.status === 'paused' && (
              <button
                onClick={() => handleSequenceAction('resume')}
                disabled={sequenceActionLoading === 'resume'}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {sequenceActionLoading === 'resume' ? 'Resuming...' : 'Resume'}
              </button>
            )}

            {/* Cancel - available for deployed, active, or paused */}
            {(sequence.status === 'deployed' || sequence.status === 'active' || sequence.status === 'paused') && (
              <button
                onClick={() => {
                  if (confirm('Cancel this sequence? This will stop all outreach across all platforms.')) {
                    handleSequenceAction('cancel')
                  }
                }}
                disabled={sequenceActionLoading === 'cancel'}
                className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                {sequenceActionLoading === 'cancel' ? 'Cancelling...' : 'Cancel'}
              </button>
            )}

            {/* Cancelled state - show re-generate option */}
            {sequence.status === 'cancelled' && (
              <button
                onClick={onRerun}
                disabled={loading === 'sequence'}
                className="px-3 py-1.5 text-sm border border-jsb-navy-lighter text-gray-300 rounded-md hover:bg-jsb-navy-lighter disabled:opacity-50"
              >
                {loading === 'sequence' ? 'Generating...' : 'Create New Sequence'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Pain Points */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-jsb-navy-light border border-jsb-navy-lighter rounded-lg p-6">
          <h3 className="text-lg font-medium text-white mb-4">Pain Point 1 (Thread 1)</h3>
          <dl className="space-y-2">
            <div>
              <dt className="text-sm text-gray-400">Pain</dt>
              <dd className="text-sm text-white">{sequence.pain_1.pain}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-400">Implication</dt>
              <dd className="text-sm text-gray-300">{sequence.pain_1.implication}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-400">Solution</dt>
              <dd className="text-sm text-gray-300">{sequence.pain_1.solution}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-400">Social Proof</dt>
              <dd className="text-sm text-gray-300">{sequence.pain_1.social_proof}</dd>
            </div>
          </dl>
        </div>

        <div className="bg-jsb-navy-light border border-jsb-navy-lighter rounded-lg p-6">
          <h3 className="text-lg font-medium text-white mb-4">Pain Point 2 (Thread 2)</h3>
          <dl className="space-y-2">
            <div>
              <dt className="text-sm text-gray-400">Pain</dt>
              <dd className="text-sm text-white">{sequence.pain_2.pain}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-400">Implication</dt>
              <dd className="text-sm text-gray-300">{sequence.pain_2.implication}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-400">Solution</dt>
              <dd className="text-sm text-gray-300">{sequence.pain_2.solution}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-400">Social Proof</dt>
              <dd className="text-sm text-gray-300">{sequence.pain_2.social_proof}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Emails */}
      <div className="bg-jsb-navy-light border border-jsb-navy-lighter rounded-lg p-6">
        <h3 className="text-lg font-medium text-white mb-4">Email Sequence</h3>
        <div className="space-y-3">
          {allEmails.map((email) => (
            <div key={email.email_number} className="border border-jsb-navy-lighter rounded-lg">
              <button
                onClick={() =>
                  setExpandedEmail(
                    expandedEmail === email.email_number ? null : email.email_number
                  )
                }
                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-jsb-navy-lighter"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-white">
                    Email {email.email_number}
                  </span>
                  <span className="text-xs text-gray-500">Day {email.day}</span>
                  <span className="text-xs bg-jsb-navy-lighter text-gray-400 px-2 py-0.5 rounded">
                    {email.structure}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">{email.word_count} words</span>
                  <span className="text-gray-400">{expandedEmail === email.email_number ? '▲' : '▼'}</span>
                </div>
              </button>
              {expandedEmail === email.email_number && (
                <div className="px-4 py-3 border-t border-jsb-navy-lighter bg-jsb-navy">
                  <div className="mb-2">
                    <span className="text-xs text-gray-400">Subject: </span>
                    <span className="text-sm font-medium text-white">{email.subject}</span>
                  </div>
                  <pre className="text-sm text-gray-200 whitespace-pre-wrap font-sans">
                    {email.body}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function TimelineTab({ memories }: { memories: Memory[] }) {
  const sourceIcons: Record<string, string> = {
    agent1_qualification: '🎯',
    agent2_research: '🔍',
    agent3_writer: '✍️',
    workflow4_smartlead: '📧',
    email_webhook: '📬',
    human: '👤',
    system: '⚙️',
  }

  return (
    <div className="bg-jsb-navy-light border border-jsb-navy-lighter rounded-lg p-6">
      <h3 className="text-lg font-medium text-white mb-4">Activity Timeline</h3>
      {memories.length === 0 ? (
        <p className="text-gray-500 text-center py-4">No activity yet</p>
      ) : (
        <div className="space-y-4">
          {memories.map((memory) => (
            <div key={memory.id} className="flex gap-3 pb-4 border-b last:border-0">
              <div className="text-xl">{sourceIcons[memory.source] || '📝'}</div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium bg-jsb-navy-lighter text-gray-300 px-2 py-0.5 rounded">
                    {memory.memory_type.replace('_', ' ')}
                  </span>
                  <span className="text-xs text-gray-500">
                    {new Date(memory.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm text-gray-700">{memory.summary}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
