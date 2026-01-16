'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { StatusBadge } from '../../../components/ui/StatusBadge'
import { SourceBadge } from '../../../components/ui/SourceBadge'
import { LoadingState } from '../../../components/ui/LoadingSpinner'
import { cn, badgeColors } from '../../../lib/styles'

interface Email {
  subject: string
  body: string
}

interface Thread {
  subject: string
  emails: Email[]
}

interface EditedContent {
  thread1?: Thread | null
  thread2?: Thread | null
}

interface PainPoint {
  pain: string
  implication: string
  solution: string
  social_proof: string
}

interface SequenceDetail {
  id: string
  leadId: string
  status: string
  reviewStatus: string
  reviewAttempts: number
  reviewResult: Record<string, unknown> | null
  thread1: Thread | null
  thread2: Thread | null
  pain1: PainPoint | null
  pain2: PainPoint | null
  strategy: {
    primaryAngle?: string
    personalizationUsed?: string[]
    toneUsed?: string
    triggerLeveraged?: string
  } | null
  createdAt: string
  approvedAt: string | null
  deployedAt: string | null
}

interface Lead {
  id: string
  name: string
  email: string
  company: string
  jobTitle: string | null
  linkedInUrl: string | null
  status: string
  source: string | null
}

interface SequenceData {
  sequence: SequenceDetail
  lead: Lead | null
  research: Record<string, unknown> | null
  reviews: unknown[]
}

function ReviewStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: badgeColors.warning,
    approved: badgeColors.success,
    revision_needed: badgeColors.orange,
    rejected: badgeColors.error,
    human_review: badgeColors.orange,
  }

  const labels: Record<string, string> = {
    pending: 'Pending Review',
    approved: 'Approved',
    revision_needed: 'Needs Revision',
    rejected: 'Rejected',
    human_review: 'Human Review',
  }

  return (
    <span className={cn('px-3 py-1.5 text-sm font-medium rounded-full', colors[status] || badgeColors.neutral)}>
      {labels[status] || status}
    </span>
  )
}

interface EmailCardProps {
  email: Email
  index: number
  threadNum: number
  isEditing: boolean
  onUpdate: (index: number, field: 'subject' | 'body', value: string) => void
}

function EmailCard({ email, index, threadNum, isEditing, onUpdate }: EmailCardProps) {
  const [expanded, setExpanded] = useState(index === 0)

  return (
    <div className="border border-jsb-navy-lighter rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 bg-jsb-navy-lighter/50 hover:bg-jsb-navy-lighter transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-jsb-navy-lighter text-xs text-gray-400 font-medium">
            {index + 1}
          </span>
          {isEditing ? (
            <input
              type="text"
              value={email.subject || ''}
              onChange={(e) => onUpdate(index, 'subject', e.target.value)}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 px-2 py-1 bg-jsb-navy border border-jsb-navy-lighter rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-jsb-pink"
              placeholder="Email subject..."
            />
          ) : (
            <span className="text-sm text-white font-medium truncate max-w-md">
              {email.subject || `Email ${index + 1}`}
            </span>
          )}
        </div>
        <svg
          className={cn('w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ml-2', expanded && 'rotate-180')}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {expanded && (
        <div className="p-4 bg-jsb-navy">
          {isEditing ? (
            <textarea
              value={email.body || ''}
              onChange={(e) => onUpdate(index, 'body', e.target.value)}
              className="w-full px-3 py-2 bg-jsb-navy-light border border-jsb-navy-lighter rounded-md text-sm text-gray-300 focus:outline-none focus:ring-2 focus:ring-jsb-pink resize-none min-h-[200px]"
              placeholder="Email body..."
            />
          ) : (
            <p className="text-sm text-gray-300 whitespace-pre-wrap">{email.body}</p>
          )}
        </div>
      )}
    </div>
  )
}

function PainPointCard({ pain, number }: { pain: PainPoint; number: number }) {
  return (
    <div className="bg-jsb-navy-light border border-jsb-navy-lighter rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-jsb-pink/20 text-jsb-pink text-xs font-medium">
          {number}
        </span>
        <span className="text-sm font-medium text-white">Pain Point {number}</span>
      </div>
      <div className="space-y-3">
        <div>
          <span className="text-xs text-gray-500 uppercase tracking-wider">Pain</span>
          <p className="text-sm text-gray-300 mt-1">{pain.pain}</p>
        </div>
        <div>
          <span className="text-xs text-gray-500 uppercase tracking-wider">Implication</span>
          <p className="text-sm text-gray-300 mt-1">{pain.implication}</p>
        </div>
        <div>
          <span className="text-xs text-gray-500 uppercase tracking-wider">Solution</span>
          <p className="text-sm text-gray-300 mt-1">{pain.solution}</p>
        </div>
        <div>
          <span className="text-xs text-gray-500 uppercase tracking-wider">Social Proof</span>
          <p className="text-sm text-gray-300 mt-1">{pain.social_proof}</p>
        </div>
      </div>
    </div>
  )
}

export default function SequenceDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [data, setData] = useState<SequenceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [reviewNotes, setReviewNotes] = useState('')
  const [activeThread, setActiveThread] = useState<1 | 2>(1)
  const [isEditing, setIsEditing] = useState(false)
  const [editedContent, setEditedContent] = useState<EditedContent>({})
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [learnedInfo, setLearnedInfo] = useState<{
    correctionsDetected: number
    corrections: Array<{ incorrectContent: string; correctContent: string; context: string }>
  } | null>(null)
  const [regenerating, setRegenerating] = useState(false)

  useEffect(() => {
    fetchSequence()
  }, [params.id])

  async function fetchSequence() {
    try {
      const res = await fetch(`/api/sequences/${params.id}`)
      if (!res.ok) throw new Error('Failed to fetch sequence')
      const json = await res.json()
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  async function handleReview(decision: 'approve' | 'revise' | 'reject') {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/sequences/${params.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, notes: reviewNotes }),
      })

      if (!res.ok) throw new Error('Failed to submit review')

      // Refresh data
      await fetchSequence()
      setReviewNotes('')

      // Show success message or redirect
      if (decision === 'approve') {
        // Could show toast or redirect
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit review')
    } finally {
      setSubmitting(false)
    }
  }

  // Start editing - initialize with current content
  function startEditing() {
    if (!data) return
    setEditedContent({
      thread1: data.sequence.thread1 ? JSON.parse(JSON.stringify(data.sequence.thread1)) : null,
      thread2: data.sequence.thread2 ? JSON.parse(JSON.stringify(data.sequence.thread2)) : null,
    })
    setIsEditing(true)
  }

  // Cancel editing
  function cancelEditing() {
    setEditedContent({})
    setIsEditing(false)
  }

  // Update thread subject
  function updateThreadSubject(threadNum: 1 | 2, value: string) {
    setEditedContent(prev => {
      const key = threadNum === 1 ? 'thread1' : 'thread2'
      const thread = prev[key]
      if (!thread) return prev
      return {
        ...prev,
        [key]: { ...thread, subject: value }
      }
    })
  }

  // Update email content
  function updateEmail(threadNum: 1 | 2, emailIndex: number, field: 'subject' | 'body', value: string) {
    setEditedContent(prev => {
      const key = threadNum === 1 ? 'thread1' : 'thread2'
      const thread = prev[key]
      if (!thread || !thread.emails) return prev
      const newEmails = [...thread.emails]
      newEmails[emailIndex] = { ...newEmails[emailIndex], [field]: value }
      return {
        ...prev,
        [key]: { ...thread, emails: newEmails }
      }
    })
  }

  // Save edits
  async function saveEdits() {
    setSaving(true)
    setLearnedInfo(null)
    try {
      const res = await fetch(`/api/sequences/${params.id}/content`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...editedContent,
          feedback: feedback || undefined,
          learnFromChanges: true,
        }),
      })

      if (!res.ok) throw new Error('Failed to save changes')

      const result = await res.json()

      // Show learned corrections if any were detected
      if (result.learned?.correctionsDetected > 0) {
        setLearnedInfo({
          correctionsDetected: result.learned.correctionsDetected,
          corrections: result.learned.corrections,
        })
      }

      // Refresh data and exit edit mode
      await fetchSequence()
      setEditedContent({})
      setFeedback('')
      setIsEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  // Regenerate sequence with corrections
  async function regenerateSequence() {
    if (!data?.lead) return
    setRegenerating(true)
    try {
      const res = await fetch(`/api/leads/${data.lead.id}/rerun`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skipQualification: true,
          skipResearch: true,
        }),
      })

      if (!res.ok) throw new Error('Failed to trigger regeneration')

      // Show success and redirect to lead page
      router.push(`/leads/${data.lead.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate')
    } finally {
      setRegenerating(false)
    }
  }

  // Get current thread content (edited or original)
  const getThreadContent = (threadNum: 1 | 2): Thread | null => {
    if (isEditing) {
      return threadNum === 1 ? editedContent.thread1 || null : editedContent.thread2 || null
    }
    return threadNum === 1 ? data?.sequence.thread1 || null : data?.sequence.thread2 || null
  }

  if (loading) {
    return <LoadingState message="Loading sequence..." />
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-red-400">{error || 'Sequence not found'}</p>
        <Link href="/sequences" className="mt-4 text-jsb-pink hover:text-jsb-pink-hover">
          ← Back to sequences
        </Link>
      </div>
    )
  }

  const { sequence, lead, research } = data
  const currentThread = getThreadContent(activeThread)
  const canReview = ['pending', 'revision_needed', 'human_review'].includes(sequence.reviewStatus)
  const canEdit = !['deployed', 'completed'].includes(sequence.status)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/sequences"
            className="p-2 rounded-lg bg-jsb-navy-lighter text-gray-400 hover:text-white hover:bg-jsb-navy-light transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">
              Sequence for {lead?.name || 'Unknown'}
            </h1>
            <p className="text-sm text-gray-400 mt-1">
              {lead?.company} • {lead?.jobTitle || 'Unknown title'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={sequence.status} />
          <ReviewStatusBadge status={sequence.reviewStatus} />
          {canEdit && !isEditing && (
            <button
              onClick={startEditing}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-jsb-navy-lighter text-gray-300 rounded-md hover:bg-jsb-navy-light hover:text-white transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
              </svg>
              Edit Content
            </button>
          )}
          {isEditing && (
            <>
              <button
                onClick={cancelEditing}
                disabled={saving}
                className="px-3 py-1.5 text-sm font-medium bg-jsb-navy-lighter text-gray-300 rounded-md hover:bg-jsb-navy-light hover:text-white transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={saveEdits}
                disabled={saving}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-jsb-pink text-white rounded-md hover:bg-jsb-pink-hover transition-colors disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Saving...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    Save Changes
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Learned Corrections Notification */}
      {learnedInfo && learnedInfo.correctionsDetected > 0 && (
        <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg className="w-6 h-6 text-purple-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
            </svg>
            <div className="flex-1">
              <h3 className="text-purple-400 font-medium">
                Learned {learnedInfo.correctionsDetected} correction{learnedInfo.correctionsDetected > 1 ? 's' : ''} from your edits!
              </h3>
              <p className="text-sm text-gray-400 mt-1">
                These will be applied to all future emails for this company.
              </p>
              <div className="mt-3 space-y-2">
                {learnedInfo.corrections.map((c, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-red-400 line-through">{c.incorrectContent}</span>
                    <span className="text-gray-500">→</span>
                    <span className="text-green-400">{c.correctContent}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => setLearnedInfo(null)}
                  className="px-3 py-1.5 text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Dismiss
                </button>
                <button
                  onClick={regenerateSequence}
                  disabled={regenerating}
                  className="px-3 py-1.5 text-sm bg-purple-500/20 text-purple-400 rounded-md hover:bg-purple-500/30 transition-colors disabled:opacity-50"
                >
                  {regenerating ? 'Regenerating...' : 'Regenerate with corrections'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lead Info Card */}
      {lead && (
        <div className="bg-jsb-navy-light border border-jsb-navy-lighter rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-jsb-navy-lighter flex items-center justify-center">
                <span className="text-lg font-medium text-gray-400">
                  {lead.name.split(' ').map(n => n[0]).join('')}
                </span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-white font-medium">{lead.name}</span>
                  {lead.source && <SourceBadge source={lead.source} />}
                </div>
                <div className="text-sm text-gray-400">{lead.email}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {lead.linkedInUrl && (
                <a
                  href={lead.linkedInUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-lg bg-jsb-navy-lighter text-gray-400 hover:text-white transition-colors"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                  </svg>
                </a>
              )}
              <Link
                href={`/leads/${lead.id}`}
                className="px-3 py-1.5 text-sm font-medium text-gray-400 bg-jsb-navy-lighter rounded-md hover:text-white transition-colors"
              >
                View Lead
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Strategy Summary */}
      {sequence.strategy && (
        <div className="bg-jsb-navy-light border border-jsb-navy-lighter rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-400 mb-3">Strategy</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <span className="text-xs text-gray-500 uppercase">Primary Angle</span>
              <p className="text-sm text-white mt-1">{sequence.strategy.primaryAngle || '-'}</p>
            </div>
            <div>
              <span className="text-xs text-gray-500 uppercase">Tone</span>
              <p className="text-sm text-white mt-1">{sequence.strategy.toneUsed || '-'}</p>
            </div>
            <div>
              <span className="text-xs text-gray-500 uppercase">Trigger</span>
              <p className="text-sm text-white mt-1">{sequence.strategy.triggerLeveraged || '-'}</p>
            </div>
            <div>
              <span className="text-xs text-gray-500 uppercase">Review Attempts</span>
              <p className="text-sm text-white mt-1">{sequence.reviewAttempts}</p>
            </div>
          </div>
          {sequence.strategy.personalizationUsed && sequence.strategy.personalizationUsed.length > 0 && (
            <div className="mt-4">
              <span className="text-xs text-gray-500 uppercase">Personalization Used</span>
              <div className="flex flex-wrap gap-2 mt-2">
                {sequence.strategy.personalizationUsed.map((p, i) => (
                  <span key={i} className="px-2 py-1 text-xs bg-jsb-navy-lighter text-gray-300 rounded">
                    {p}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Email Threads - 2 columns */}
        <div className="lg:col-span-2 space-y-4">
          {/* Thread Tabs */}
          <div className="flex gap-2">
            <button
              onClick={() => setActiveThread(1)}
              className={cn(
                'px-4 py-2 text-sm font-medium rounded-lg transition-colors',
                activeThread === 1
                  ? 'bg-jsb-pink text-white'
                  : 'bg-jsb-navy-lighter text-gray-400 hover:text-white'
              )}
            >
              Thread 1 ({sequence.thread1?.emails?.length || 0} emails)
            </button>
            <button
              onClick={() => setActiveThread(2)}
              className={cn(
                'px-4 py-2 text-sm font-medium rounded-lg transition-colors',
                activeThread === 2
                  ? 'bg-jsb-pink text-white'
                  : 'bg-jsb-navy-lighter text-gray-400 hover:text-white'
              )}
            >
              Thread 2 ({sequence.thread2?.emails?.length || 0} emails)
            </button>
          </div>

          {/* Thread Content */}
          {currentThread ? (
            <div className="bg-jsb-navy-light border border-jsb-navy-lighter rounded-lg p-4">
              <div className="mb-4">
                <span className="text-xs text-gray-500 uppercase">Thread Subject</span>
                {isEditing ? (
                  <input
                    type="text"
                    value={currentThread.subject || ''}
                    onChange={(e) => updateThreadSubject(activeThread, e.target.value)}
                    className="w-full mt-1 px-3 py-2 bg-jsb-navy border border-jsb-navy-lighter rounded-md text-white font-medium focus:outline-none focus:ring-2 focus:ring-jsb-pink"
                    placeholder="Thread subject..."
                  />
                ) : (
                  <p className="text-white font-medium mt-1">{currentThread.subject}</p>
                )}
              </div>
              <div className="space-y-3">
                {currentThread.emails?.map((email, i) => (
                  <EmailCard
                    key={i}
                    email={email}
                    index={i}
                    threadNum={activeThread}
                    isEditing={isEditing}
                    onUpdate={(idx, field, value) => updateEmail(activeThread, idx, field, value)}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-jsb-navy-light border border-jsb-navy-lighter rounded-lg p-8 text-center">
              <p className="text-gray-400">No emails in this thread</p>
            </div>
          )}

          {/* Feedback Section - Shows when editing */}
          {isEditing && (
            <div className="bg-jsb-navy-light border border-jsb-navy-lighter rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                </svg>
                <h3 className="text-sm font-medium text-white">Feedback (Optional)</h3>
              </div>
              <p className="text-xs text-gray-400 mb-2">
                Explain what was wrong or what you changed. The system will auto-detect corrections from your edits, but explicit feedback helps improve future emails.
              </p>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="e.g., 'They're a marketing agency, not a travel agency' or 'Too salesy, tone down the urgency'"
                className="w-full px-3 py-2 bg-jsb-navy border border-jsb-navy-lighter rounded-md text-sm text-gray-300 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                rows={3}
              />
              <div className="mt-3 flex items-start gap-2 text-xs text-gray-500">
                <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                </svg>
                <span>
                  Your edits will be analyzed to automatically detect corrections. High-value corrections (facts, business type) are promoted to global guidelines.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Pain Points & Review - 1 column */}
        <div className="space-y-4">
          {/* Pain Points */}
          {sequence.pain1 && <PainPointCard pain={sequence.pain1} number={1} />}
          {sequence.pain2 && <PainPointCard pain={sequence.pain2} number={2} />}

          {/* Review Panel */}
          {canReview && (
            <div className="bg-jsb-navy-light border border-jsb-navy-lighter rounded-lg p-4">
              <h3 className="text-sm font-medium text-white mb-4">Review Decision</h3>
              <textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Add review notes (optional)..."
                className="w-full px-3 py-2 bg-jsb-navy border border-jsb-navy-lighter rounded-md text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-jsb-pink mb-4 resize-none"
                rows={3}
              />
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => handleReview('approve')}
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500/20 text-emerald-400 font-medium rounded-md border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors disabled:opacity-50"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  Approve
                </button>
                <button
                  onClick={() => handleReview('revise')}
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500/20 text-amber-400 font-medium rounded-md border border-amber-500/30 hover:bg-amber-500/30 transition-colors disabled:opacity-50"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                  Request Revision
                </button>
                <button
                  onClick={() => handleReview('reject')}
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500/20 text-red-400 font-medium rounded-md border border-red-500/30 hover:bg-red-500/30 transition-colors disabled:opacity-50"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Reject
                </button>
              </div>
            </div>
          )}

          {/* Already reviewed indicator */}
          {!canReview && sequence.reviewStatus === 'approved' && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4 text-center">
              <svg className="w-8 h-8 text-emerald-400 mx-auto mb-2" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
              </svg>
              <p className="text-emerald-400 font-medium">Approved</p>
              {sequence.approvedAt && (
                <p className="text-xs text-gray-400 mt-1">
                  {new Date(sequence.approvedAt).toLocaleString()}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
