'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { LoadingState } from '../../../components/ui/LoadingSpinner'
import { NoDataEmptyState } from '../../../components/ui/EmptyState'
import { cn, badgeColors } from '../../../lib/styles'

interface Version {
  id: string
  versionNumber: number
  versionLabel: string | null
  status: string
  changeType: string
  changeDescription: string | null
  totalUses: number
  successRate: string | null
  replyRate: string | null
  positiveReplyRate: string | null
  injectedPatterns: Array<{ pattern_id: string; pattern_content: string }>
  fullPrompt: string
  createdAt: string
  activatedAt: string | null
}

interface ABTest {
  id: string
  name: string
  hypothesis: string
  status: string
  controlPercentage: number
  winnerVersionId: string | null
  significance: string | null
  results: Record<string, unknown> | null
  startedAt: string | null
  completedAt: string | null
}

interface PromptDetail {
  id: string
  name: string
  category: string
  description: string | null
  basePrompt: string
  dynamicSections: Array<{ name: string; position: string }>
  activeVersionId: string | null
  createdAt: string
  updatedAt: string
}

interface PromptData {
  prompt: PromptDetail
  versions: Version[]
  abTests: ABTest[]
  summary: {
    totalVersions: number
    activeVersion: number | null
    totalUses: number
    currentSuccessRate: string | null
    runningTests: number
  }
}

const statusColors: Record<string, string> = {
  draft: badgeColors.neutral,
  testing: badgeColors.warning,
  active: badgeColors.success,
  deprecated: badgeColors.error,
  rolled_back: badgeColors.error,
}

const statusLabels: Record<string, string> = {
  draft: 'Draft',
  testing: 'Testing',
  active: 'Active',
  deprecated: 'Deprecated',
  rolled_back: 'Rolled Back',
}

const changeTypeColors: Record<string, string> = {
  manual: badgeColors.info,
  learned_injection: badgeColors.purple,
  ab_test: badgeColors.warning,
  rollback: badgeColors.error,
}

const changeTypeLabels: Record<string, string> = {
  manual: 'Manual Edit',
  learned_injection: 'Learned Patterns',
  ab_test: 'A/B Test',
  rollback: 'Rollback',
}

const changeTypeOptions = [
  { value: 'manual', label: 'Manual Edit', description: 'Direct changes to prompt content' },
  { value: 'learned_injection', label: 'Learned Patterns', description: 'Incorporating discovered patterns' },
  { value: 'ab_test', label: 'A/B Test Variant', description: 'New variant for testing' },
]

const testStatusColors: Record<string, string> = {
  draft: badgeColors.neutral,
  running: badgeColors.warning,
  paused: badgeColors.info,
  completed: badgeColors.success,
  cancelled: badgeColors.error,
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn('px-2 py-1 text-xs font-medium rounded-full', statusColors[status] || badgeColors.neutral)}>
      {statusLabels[status] || status}
    </span>
  )
}

function ChangeTypeBadge({ type }: { type: string }) {
  return (
    <span className={cn('px-2 py-1 text-xs font-medium rounded-full', changeTypeColors[type] || badgeColors.neutral)}>
      {changeTypeLabels[type] || type}
    </span>
  )
}

function VersionCard({ version, isActive, onDuplicate }: { version: Version; isActive: boolean; onDuplicate: (prompt: string) => void }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={cn(
      'bg-jsb-navy border rounded-lg overflow-hidden transition-all',
      isActive ? 'border-jsb-pink/50' : 'border-jsb-navy-lighter'
    )}>
      <div
        className="p-4 cursor-pointer hover:bg-jsb-navy-light transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-white font-medium">
                v{version.versionNumber}
                {version.versionLabel && (
                  <span className="text-gray-400 font-normal ml-1">({version.versionLabel})</span>
                )}
              </span>
              <StatusBadge status={version.status} />
              <ChangeTypeBadge type={version.changeType} />
              {isActive && (
                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-jsb-pink/20 text-jsb-pink">
                  Current
                </span>
              )}
            </div>
            {version.changeDescription && (
              <p className="text-sm text-gray-400">{version.changeDescription}</p>
            )}
          </div>
          <div className="flex items-center gap-6 flex-shrink-0">
            {version.successRate && (
              <div className="text-right">
                <div className={cn(
                  'text-sm font-medium',
                  parseFloat(version.successRate) >= 15 ? 'text-emerald-400' :
                  parseFloat(version.successRate) >= 8 ? 'text-yellow-400' : 'text-gray-400'
                )}>
                  {version.successRate}%
                </div>
                <div className="text-xs text-gray-500">success</div>
              </div>
            )}
            <div className="text-right">
              <div className="text-sm text-gray-300">{version.totalUses.toLocaleString()}</div>
              <div className="text-xs text-gray-500">uses</div>
            </div>
            <svg
              className={cn('w-5 h-5 text-gray-500 transition-transform', expanded && 'rotate-180')}
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </div>
        </div>

        <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
          <span>Created {new Date(version.createdAt).toLocaleDateString()}</span>
          {version.activatedAt && (
            <span>Activated {new Date(version.activatedAt).toLocaleDateString()}</span>
          )}
          {version.injectedPatterns.length > 0 && (
            <span className="text-purple-400">
              {version.injectedPatterns.length} pattern{version.injectedPatterns.length !== 1 ? 's' : ''} injected
            </span>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-jsb-navy-lighter">
          {/* Metrics */}
          {(version.replyRate || version.positiveReplyRate) && (
            <div className="p-4 bg-jsb-navy-light/50 border-b border-jsb-navy-lighter">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="text-xs text-gray-500 mb-1">Reply Rate</div>
                  <div className="text-lg font-medium text-cyan-400">{version.replyRate || '—'}%</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">Positive Reply</div>
                  <div className="text-lg font-medium text-emerald-400">{version.positiveReplyRate || '—'}%</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">Success Rate</div>
                  <div className="text-lg font-medium text-jsb-pink">{version.successRate || '—'}%</div>
                </div>
              </div>
            </div>
          )}

          {/* Injected Patterns */}
          {version.injectedPatterns.length > 0 && (
            <div className="p-4 border-b border-jsb-navy-lighter">
              <h4 className="text-sm font-medium text-gray-400 mb-2">Injected Patterns</h4>
              <div className="space-y-2">
                {version.injectedPatterns.map((pattern, i) => (
                  <div key={i} className="text-sm text-gray-300 bg-jsb-navy-lighter rounded p-2">
                    {pattern.pattern_content}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Full Prompt */}
          <div className="p-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium text-gray-400">Full Prompt</h4>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDuplicate(version.fullPrompt)
                }}
                className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-gray-400 hover:text-white bg-jsb-navy-lighter hover:bg-jsb-navy-light rounded transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
                </svg>
                Use as base for new version
              </button>
            </div>
            <pre className="text-sm text-gray-300 bg-jsb-navy-lighter rounded p-3 overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto">
              {version.fullPrompt}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

function ABTestCard({ test }: { test: ABTest }) {
  return (
    <div className="bg-jsb-navy border border-jsb-navy-lighter rounded-lg p-4">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h4 className="text-white font-medium">{test.name}</h4>
            <span className={cn('px-2 py-0.5 text-xs font-medium rounded-full', testStatusColors[test.status])}>
              {test.status}
            </span>
          </div>
          <p className="text-sm text-gray-400">{test.hypothesis}</p>
        </div>
        {test.winnerVersionId && (
          <div className="flex items-center gap-1 px-2 py-1 bg-emerald-500/20 rounded-full">
            <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0" />
            </svg>
            <span className="text-xs text-emerald-400 font-medium">Winner Found</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-6 text-sm">
        <div>
          <span className="text-gray-500">Control: </span>
          <span className="text-white">{test.controlPercentage}%</span>
        </div>
        {test.significance && (
          <div>
            <span className="text-gray-500">Significance: </span>
            <span className={cn(
              parseFloat(test.significance) >= 95 ? 'text-emerald-400' :
              parseFloat(test.significance) >= 80 ? 'text-yellow-400' : 'text-gray-400'
            )}>{test.significance}%</span>
          </div>
        )}
        {test.startedAt && (
          <div className="text-gray-500">
            Started {new Date(test.startedAt).toLocaleDateString()}
          </div>
        )}
      </div>
    </div>
  )
}

interface CreateVersionModalProps {
  isOpen: boolean
  onClose: () => void
  onCreated: () => void
  promptId: string
  initialPrompt: string
  nextVersionNumber: number
}

function CreateVersionModal({ isOpen, onClose, onCreated, promptId, initialPrompt, nextVersionNumber }: CreateVersionModalProps) {
  const [fullPrompt, setFullPrompt] = useState(initialPrompt)
  const [changeDescription, setChangeDescription] = useState('')
  const [changeType, setChangeType] = useState('manual')
  const [versionLabel, setVersionLabel] = useState(`v${nextVersionNumber}.0`)
  const [setActive, setSetActive] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Update state when modal opens with new initial values
  useEffect(() => {
    if (isOpen) {
      setFullPrompt(initialPrompt)
      setVersionLabel(`v${nextVersionNumber}.0`)
    }
  }, [isOpen, initialPrompt, nextVersionNumber])

  if (!isOpen) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)

    try {
      const res = await fetch(`/api/prompts/${promptId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullPrompt: fullPrompt.trim(),
          changeDescription: changeDescription.trim() || null,
          changeType,
          versionLabel: versionLabel.trim() || null,
          setActive,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create version')
      }

      onCreated()
      handleClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create version')
    } finally {
      setSaving(false)
    }
  }

  function handleClose() {
    if (!saving) {
      setFullPrompt('')
      setChangeDescription('')
      setChangeType('manual')
      setSetActive(false)
      setError(null)
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative bg-jsb-navy-light border border-jsb-navy-lighter rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-jsb-navy-lighter">
          <div>
            <h2 className="text-xl font-semibold text-white">Create New Version</h2>
            <p className="text-sm text-gray-400 mt-0.5">This will be version {nextVersionNumber}</p>
          </div>
          <button
            onClick={handleClose}
            disabled={saving}
            className="p-2 text-gray-400 hover:text-white hover:bg-jsb-navy-lighter rounded-lg transition-colors disabled:opacity-50"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="overflow-y-auto max-h-[calc(90vh-140px)]">
          <div className="p-6 space-y-5">
            {/* Error */}
            {error && (
              <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* Version Label */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Version Label
                </label>
                <input
                  type="text"
                  value={versionLabel}
                  onChange={(e) => setVersionLabel(e.target.value)}
                  placeholder="e.g., v2.0-experiment"
                  className="w-full px-4 py-2.5 bg-jsb-navy border border-jsb-navy-lighter rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-jsb-pink focus:border-transparent transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Change Type
                </label>
                <select
                  value={changeType}
                  onChange={(e) => setChangeType(e.target.value)}
                  className="w-full px-4 py-2.5 bg-jsb-navy border border-jsb-navy-lighter rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-jsb-pink focus:border-transparent cursor-pointer"
                >
                  {changeTypeOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Change Description */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Change Description
              </label>
              <input
                type="text"
                value={changeDescription}
                onChange={(e) => setChangeDescription(e.target.value)}
                placeholder="What changed in this version?"
                className="w-full px-4 py-2.5 bg-jsb-navy border border-jsb-navy-lighter rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-jsb-pink focus:border-transparent transition-all"
              />
            </div>

            {/* Full Prompt */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Full Prompt <span className="text-red-400">*</span>
              </label>
              <textarea
                value={fullPrompt}
                onChange={(e) => setFullPrompt(e.target.value)}
                placeholder="Enter the full prompt content..."
                rows={16}
                className="w-full px-4 py-3 bg-jsb-navy border border-jsb-navy-lighter rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-jsb-pink focus:border-transparent transition-all font-mono text-sm resize-none"
                required
              />
            </div>

            {/* Set Active Toggle */}
            <div className="flex items-center justify-between p-4 bg-jsb-navy rounded-lg border border-jsb-navy-lighter">
              <div>
                <div className="text-sm font-medium text-white">Set as Active Version</div>
                <div className="text-xs text-gray-400 mt-0.5">
                  This will deprecate the current active version and make this version live immediately
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSetActive(!setActive)}
                className={cn(
                  'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-jsb-pink focus:ring-offset-2 focus:ring-offset-jsb-navy',
                  setActive ? 'bg-jsb-pink' : 'bg-jsb-navy-lighter'
                )}
              >
                <span
                  className={cn(
                    'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                    setActive ? 'translate-x-5' : 'translate-x-0'
                  )}
                />
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-jsb-navy-lighter bg-jsb-navy/50">
            <button
              type="button"
              onClick={handleClose}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !fullPrompt.trim()}
              className="px-4 py-2 bg-jsb-pink text-white text-sm font-medium rounded-lg hover:bg-jsb-pink-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {saving ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Creating...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Create Version
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function PromptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [data, setData] = useState<PromptData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'versions' | 'tests'>('versions')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [initialPromptForModal, setInitialPromptForModal] = useState('')

  useEffect(() => {
    fetchPromptDetails()
  }, [id])

  async function fetchPromptDetails() {
    try {
      const res = await fetch(`/api/prompts/${id}`)
      if (!res.ok) throw new Error('Failed to fetch')
      const json = await res.json()
      setData(json)
    } catch (error) {
      console.error('Failed to fetch prompt details:', error)
    } finally {
      setLoading(false)
    }
  }

  function openCreateModal(basePrompt?: string) {
    const activeVersion = data?.versions.find(v => v.id === data?.prompt.activeVersionId)
    setInitialPromptForModal(basePrompt || activeVersion?.fullPrompt || data?.prompt.basePrompt || '')
    setShowCreateModal(true)
  }

  if (loading) {
    return <LoadingState message="Loading prompt details..." />
  }

  if (!data) {
    return <NoDataEmptyState title="Prompt not found" />
  }

  const { prompt, versions, abTests, summary } = data
  const nextVersionNumber = (summary.totalVersions || 0) + 1

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/prompts"
          className="p-2 rounded-lg bg-jsb-navy-lighter text-gray-400 hover:text-white hover:bg-jsb-navy-light transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">{prompt.name}</h1>
            <span className={cn(
              'px-2 py-1 text-xs font-medium rounded-full',
              prompt.category === 'agent' ? badgeColors.pink :
              prompt.category === 'helper' ? badgeColors.cyan :
              prompt.category === 'template' ? badgeColors.purple : badgeColors.neutral
            )}>
              {prompt.category}
            </span>
          </div>
          {prompt.description && (
            <p className="text-sm text-gray-400 mt-1">{prompt.description}</p>
          )}
        </div>
        <button
          onClick={() => openCreateModal()}
          className="flex items-center gap-2 px-4 py-2 bg-jsb-pink text-white text-sm font-medium rounded-lg hover:bg-jsb-pink-hover transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New Version
        </button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="bg-jsb-navy-light border border-jsb-navy-lighter rounded-lg p-4">
          <div className="text-2xl font-bold text-white">{summary.totalVersions}</div>
          <div className="text-sm text-gray-400">Versions</div>
        </div>
        <div className="bg-jsb-navy-light border border-jsb-navy-lighter rounded-lg p-4">
          <div className="text-2xl font-bold text-cyan-400">v{summary.activeVersion || '—'}</div>
          <div className="text-sm text-gray-400">Active</div>
        </div>
        <div className="bg-jsb-navy-light border border-jsb-navy-lighter rounded-lg p-4">
          <div className="text-2xl font-bold text-jsb-pink">{summary.totalUses.toLocaleString()}</div>
          <div className="text-sm text-gray-400">Total Uses</div>
        </div>
        <div className="bg-jsb-navy-light border border-jsb-navy-lighter rounded-lg p-4">
          <div className={cn(
            'text-2xl font-bold',
            summary.currentSuccessRate && parseFloat(summary.currentSuccessRate) >= 15 ? 'text-emerald-400' :
            summary.currentSuccessRate && parseFloat(summary.currentSuccessRate) >= 8 ? 'text-yellow-400' : 'text-gray-400'
          )}>
            {summary.currentSuccessRate ? `${summary.currentSuccessRate}%` : '—'}
          </div>
          <div className="text-sm text-gray-400">Success Rate</div>
        </div>
        <div className="bg-jsb-navy-light border border-jsb-navy-lighter rounded-lg p-4">
          <div className="text-2xl font-bold text-amber-400">{summary.runningTests}</div>
          <div className="text-sm text-gray-400">Active Tests</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-jsb-navy-lighter">
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab('versions')}
            className={cn(
              'px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px',
              activeTab === 'versions'
                ? 'border-jsb-pink text-white'
                : 'border-transparent text-gray-400 hover:text-white hover:border-gray-600'
            )}
          >
            Version History
            <span className="ml-2 text-gray-500">({versions.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('tests')}
            className={cn(
              'px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px',
              activeTab === 'tests'
                ? 'border-jsb-pink text-white'
                : 'border-transparent text-gray-400 hover:text-white hover:border-gray-600'
            )}
          >
            A/B Tests
            <span className="ml-2 text-gray-500">({abTests.length})</span>
          </button>
        </div>
      </div>

      {/* Content */}
      {activeTab === 'versions' ? (
        versions.length === 0 ? (
          <NoDataEmptyState title="No versions yet" description="Version history will appear here once prompts are used." />
        ) : (
          <div className="space-y-3">
            {versions.map(version => (
              <VersionCard
                key={version.id}
                version={version}
                isActive={version.id === prompt.activeVersionId}
                onDuplicate={openCreateModal}
              />
            ))}
          </div>
        )
      ) : (
        abTests.length === 0 ? (
          <NoDataEmptyState title="No A/B tests" description="A/B test experiments will appear here." />
        ) : (
          <div className="space-y-3">
            {abTests.map(test => (
              <ABTestCard key={test.id} test={test} />
            ))}
          </div>
        )
      )}

      {/* Create Version Modal */}
      <CreateVersionModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={fetchPromptDetails}
        promptId={id}
        initialPrompt={initialPromptForModal}
        nextVersionNumber={nextVersionNumber}
      />
    </div>
  )
}
