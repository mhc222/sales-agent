'use client'

import { Shell } from '@/components/layout/Shell'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { LoadingState } from '../../components/ui/LoadingSpinner'
import { NoDataEmptyState } from '../../components/ui/EmptyState'
import { cn, badgeColors } from '../../lib/styles'

interface Prompt {
  id: string
  name: string
  category: string
  description: string
  versionCount: number
  totalUses: number
  avgSuccessRate: number
  hasActiveTest: boolean
  activeTestName: string | null
  updatedAt: string
}

interface PromptsData {
  summary: {
    totalPrompts: number
    totalVersions: number
    activeTests: number
    totalUses: number
  }
  prompts: Prompt[]
  byCategory: Record<string, Prompt[]>
}

const categoryLabels: Record<string, string> = {
  agent: 'Agents',
  helper: 'Helpers',
  template: 'Templates',
  other: 'Other',
}

const categoryColors: Record<string, string> = {
  agent: badgeColors.pink,
  helper: badgeColors.cyan,
  template: badgeColors.purple,
  other: badgeColors.neutral,
}

const categoryOptions = [
  { value: 'agent', label: 'Agent', description: 'Main AI agents (qualification, writer, etc.)' },
  { value: 'helper', label: 'Helper', description: 'Supporting prompts for specific tasks' },
  { value: 'template', label: 'Template', description: 'Reusable prompt templates' },
]

function CategoryBadge({ category }: { category: string }) {
  return (
    <span className={cn('px-2 py-1 text-xs font-medium rounded-full', categoryColors[category] || badgeColors.neutral)}>
      {categoryLabels[category] || category}
    </span>
  )
}

function SuccessRateBadge({ rate }: { rate: number }) {
  const color = rate >= 15 ? 'text-emerald-400' : rate >= 8 ? 'text-yellow-400' : 'text-gray-400'
  return (
    <span className={cn('text-sm font-medium', color)}>
      {rate > 0 ? `${(rate * 100).toFixed(1)}%` : '—'}
    </span>
  )
}

function PromptCard({ prompt }: { prompt: Prompt }) {
  return (
    <Link href={`/prompts/${prompt.id}`}>
      <div className="bg-jsb-navy border border-jsb-navy-lighter rounded-lg p-4 hover:border-jsb-pink/30 hover:bg-jsb-navy-light transition-all duration-150">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <CategoryBadge category={prompt.category} />
              {prompt.hasActiveTest && (
                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  A/B Testing
                </span>
              )}
            </div>
            <h3 className="text-white font-medium mb-1">{prompt.name}</h3>
            {prompt.description && (
              <p className="text-sm text-gray-400 line-clamp-2">{prompt.description}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <SuccessRateBadge rate={prompt.avgSuccessRate} />
            <span className="text-xs text-gray-500">success rate</span>
          </div>
        </div>

        <div className="flex items-center gap-6 mt-4 pt-3 border-t border-jsb-navy-lighter">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
            </svg>
            <span className="text-sm text-gray-400">{prompt.versionCount} versions</span>
          </div>
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
            <span className="text-sm text-gray-400">{prompt.totalUses.toLocaleString()} uses</span>
          </div>
          <div className="text-xs text-gray-500 ml-auto">
            Updated {new Date(prompt.updatedAt).toLocaleDateString()}
          </div>
        </div>
      </div>
    </Link>
  )
}

interface CreateModalProps {
  isOpen: boolean
  onClose: () => void
  onCreated: () => void
}

function CreatePromptModal({ isOpen, onClose, onCreated }: CreateModalProps) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [category, setCategory] = useState('agent')
  const [description, setDescription] = useState('')
  const [basePrompt, setBasePrompt] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)

    try {
      const res = await fetch('/api/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          category,
          description: description.trim() || null,
          basePrompt: basePrompt.trim(),
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create prompt')
      }

      onCreated()
      router.push(`/prompts/${data.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create prompt')
    } finally {
      setSaving(false)
    }
  }

  function handleClose() {
    if (!saving) {
      setName('')
      setCategory('agent')
      setDescription('')
      setBasePrompt('')
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
      <div className="relative bg-jsb-navy-light border border-jsb-navy-lighter rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-jsb-navy-lighter">
          <h2 className="text-xl font-semibold text-white">Create New Prompt</h2>
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

            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Prompt Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., agent1-qualification"
                className="w-full px-4 py-2.5 bg-jsb-navy border border-jsb-navy-lighter rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-jsb-pink focus:border-transparent transition-all"
                required
              />
              <p className="mt-1.5 text-xs text-gray-500">
                Use lowercase with hyphens. This will be used as the unique identifier.
              </p>
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Category <span className="text-red-400">*</span>
              </label>
              <div className="grid grid-cols-3 gap-3">
                {categoryOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setCategory(opt.value)}
                    className={cn(
                      'p-3 rounded-lg border text-left transition-all',
                      category === opt.value
                        ? 'border-jsb-pink bg-jsb-pink/10'
                        : 'border-jsb-navy-lighter bg-jsb-navy hover:border-jsb-navy-light'
                    )}
                  >
                    <div className={cn(
                      'text-sm font-medium mb-1',
                      category === opt.value ? 'text-jsb-pink' : 'text-white'
                    )}>
                      {opt.label}
                    </div>
                    <div className="text-xs text-gray-500">{opt.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Description
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of what this prompt does"
                className="w-full px-4 py-2.5 bg-jsb-navy border border-jsb-navy-lighter rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-jsb-pink focus:border-transparent transition-all"
              />
            </div>

            {/* Base Prompt */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Base Prompt <span className="text-red-400">*</span>
              </label>
              <textarea
                value={basePrompt}
                onChange={(e) => setBasePrompt(e.target.value)}
                placeholder="Enter the full prompt content here..."
                rows={12}
                className="w-full px-4 py-3 bg-jsb-navy border border-jsb-navy-lighter rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-jsb-pink focus:border-transparent transition-all font-mono text-sm resize-none"
                required
              />
              <p className="mt-1.5 text-xs text-gray-500">
                This will be saved as version 1.0 and set as the active version.
              </p>
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
              disabled={saving || !name.trim() || !basePrompt.trim()}
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
                  Create Prompt
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function PromptsPage() {
  const [data, setData] = useState<PromptsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'all' | 'byCategory'>('byCategory')
  const [filterCategory, setFilterCategory] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)

  useEffect(() => {
    fetchPrompts()
  }, [])

  async function fetchPrompts() {
    try {
      const res = await fetch('/api/prompts')
      if (!res.ok) throw new Error('Failed to fetch')
      const json = await res.json()
      setData(json)
    } catch (error) {
      console.error('Failed to fetch prompts:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <LoadingState message="Loading prompts..." />
  }

  if (!data || data.prompts.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Prompt Management</h1>
            <p className="text-sm text-gray-400 mt-1">Version control and A/B testing for AI prompts</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-jsb-pink text-white text-sm font-medium rounded-lg hover:bg-jsb-pink-hover transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Create Prompt
          </button>
        </div>
        <NoDataEmptyState
          title="No prompts configured"
          description="Get started by creating your first prompt."
        />
        <CreatePromptModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onCreated={fetchPrompts}
        />
      </div>
    )
  }

  const categories = Object.keys(data.byCategory)
  const filteredPrompts = filterCategory
    ? data.prompts.filter(p => p.category === filterCategory)
    : data.prompts

  return (
    <Shell>
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Prompt Management</h1>
          <p className="text-sm text-gray-400 mt-1">Version control and A/B testing for AI prompts</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-jsb-pink text-white text-sm font-medium rounded-lg hover:bg-jsb-pink-hover transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Create Prompt
        </button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-jsb-navy-light border border-jsb-navy-lighter rounded-lg p-4">
          <div className="text-2xl font-bold text-white">{data.summary.totalPrompts}</div>
          <div className="text-sm text-gray-400">Prompts</div>
        </div>
        <div className="bg-jsb-navy-light border border-jsb-navy-lighter rounded-lg p-4">
          <div className="text-2xl font-bold text-cyan-400">{data.summary.totalVersions}</div>
          <div className="text-sm text-gray-400">Versions</div>
        </div>
        <div className="bg-jsb-navy-light border border-jsb-navy-lighter rounded-lg p-4">
          <div className="text-2xl font-bold text-amber-400">{data.summary.activeTests}</div>
          <div className="text-sm text-gray-400">Active A/B Tests</div>
        </div>
        <div className="bg-jsb-navy-light border border-jsb-navy-lighter rounded-lg p-4">
          <div className="text-2xl font-bold text-jsb-pink">{data.summary.totalUses.toLocaleString()}</div>
          <div className="text-sm text-gray-400">Total Uses</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 border-b border-jsb-navy-lighter pb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">View:</span>
          <button
            onClick={() => setViewMode('byCategory')}
            className={cn(
              'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
              viewMode === 'byCategory'
                ? 'bg-jsb-pink/20 text-jsb-pink'
                : 'text-gray-400 hover:text-white hover:bg-jsb-navy-lighter'
            )}
          >
            By Category
          </button>
          <button
            onClick={() => setViewMode('all')}
            className={cn(
              'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
              viewMode === 'all'
                ? 'bg-jsb-pink/20 text-jsb-pink'
                : 'text-gray-400 hover:text-white hover:bg-jsb-navy-lighter'
            )}
          >
            All
          </button>
        </div>

        {viewMode === 'all' && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-sm text-gray-400">Filter:</span>
            <button
              onClick={() => setFilterCategory(null)}
              className={cn(
                'px-2 py-1 text-xs font-medium rounded-full transition-colors',
                filterCategory === null
                  ? 'bg-jsb-pink/20 text-jsb-pink'
                  : 'text-gray-400 hover:text-white bg-jsb-navy-lighter'
              )}
            >
              All
            </button>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={cn(
                  'px-2 py-1 text-xs font-medium rounded-full transition-colors',
                  filterCategory === cat
                    ? categoryColors[cat]
                    : 'text-gray-400 hover:text-white bg-jsb-navy-lighter'
                )}
              >
                {categoryLabels[cat] || cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      {viewMode === 'byCategory' ? (
        <div className="space-y-8">
          {categories.map(category => (
            <div key={category}>
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-lg font-semibold text-white">
                  {categoryLabels[category] || category}
                </h2>
                <span className="text-sm text-gray-500">
                  ({data.byCategory[category].length})
                </span>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {data.byCategory[category].map(prompt => (
                  <PromptCard key={prompt.id} prompt={prompt} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredPrompts.map(prompt => (
            <PromptCard key={prompt.id} prompt={prompt} />
          ))}
        </div>
      )}

      {/* Create Modal */}
      <CreatePromptModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={fetchPrompts}
      />
    </div>
    </Shell>
  )
}
