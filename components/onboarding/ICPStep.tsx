'use client'

import { useEffect, useState } from 'react'
import { jsb, cn } from '@/lib/styles'
import type {
  AccountCriteria,
  ICPPersona,
  ICPTrigger,
  ICPPriority,
} from '@/src/lib/tenant-settings'

type ICPChange = {
  category: string
  description: string
  reason: string
}

type ICPData = {
  accountCriteria: AccountCriteria | null
  personas: ICPPersona[]
  triggers: ICPTrigger[]
  researchStatus: 'idle' | 'loading' | 'complete' | 'error'
  researchError?: string
  marketResearch: string
  reconciled?: boolean
  changes?: ICPChange[]
}

type Props = {
  data: ICPData
  websiteUrl: string
  companyName: string
  onChange: (data: ICPData) => void
  onNext: () => void
  onBack: () => void
}

// Research stages for step display
const RESEARCH_STAGES = [
  'Analyzing website',
  'Identifying target outcomes',
  'Building account criteria',
  'Creating buyer personas',
  'Discovering trigger signals',
  'Finalizing ICP'
]

// Loading animation component with step progress
function ResearchingAnimation({ stage, stageIndex, isComplete }: { stage: string; stageIndex: number; isComplete?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 space-y-8">
      {/* Animated spinner with dual rings - or success icon when complete */}
      <div className="relative w-20 h-20">
        {isComplete ? (
          <>
            {/* Success animation */}
            <div className="absolute inset-0 bg-green-500/20 rounded-full animate-ping" />
            <div className="absolute inset-0 bg-green-500 rounded-full flex items-center justify-center animate-scale-check">
              <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </>
        ) : (
          <>
            <div className="absolute inset-0 border-4 border-jsb-pink/20 rounded-full" />
            <div className="absolute inset-0 border-4 border-transparent border-t-jsb-pink rounded-full animate-spin" />
            <div
              className="absolute inset-2 border-4 border-transparent border-t-jsb-pink-light rounded-full animate-spin"
              style={{ animationDirection: 'reverse', animationDuration: '1.5s' }}
            />
            {/* Center icon */}
            <div className="absolute inset-0 flex items-center justify-center">
              <svg className="w-6 h-6 text-jsb-pink animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </>
        )}
      </div>

      {/* Title with shimmer effect */}
      <div className="text-center space-y-2">
        <h3 className={cn(jsb.heading, 'text-xl')}>
          {isComplete ? 'Research Complete!' : 'Researching your business...'}
        </h3>
        <p className={cn(
          'text-sm font-medium',
          isComplete ? 'text-green-400' : 'text-jsb-pink animate-pulse'
        )}>
          {isComplete ? 'Your ICP is ready for review' : stage}
        </p>
      </div>

      {/* Step progress indicators */}
      <div className="w-full max-w-md space-y-3">
        {RESEARCH_STAGES.map((s, index) => {
          const isStepComplete = index < stageIndex || isComplete
          const isCurrent = index === stageIndex && !isComplete
          const isPending = index > stageIndex && !isComplete

          return (
            <div key={index} className="flex items-center gap-3">
              <div
                className={cn(
                  'w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-all duration-500',
                  isStepComplete && 'bg-green-500 text-white scale-100',
                  isCurrent && 'bg-jsb-pink text-white animate-pulse scale-110',
                  isPending && 'bg-jsb-navy-lighter text-gray-500 scale-90'
                )}
              >
                {isStepComplete ? (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  index + 1
                )}
              </div>
              <span
                className={cn(
                  'text-sm transition-all duration-300',
                  isStepComplete && 'text-green-400',
                  isCurrent && 'text-white font-medium',
                  isPending && 'text-gray-500'
                )}
              >
                {s}
              </span>
              {isCurrent && !isComplete && (
                <div className="ml-auto flex items-center gap-1">
                  <div className="w-1.5 h-1.5 bg-jsb-pink rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 bg-jsb-pink rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 bg-jsb-pink rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Subtle hint */}
      {!isComplete && (
        <p className="text-gray-500 text-xs text-center max-w-sm">
          AI is analyzing your website and industry to build a comprehensive customer profile
        </p>
      )}
    </div>
  )
}

// Priority badge component
function PriorityBadge({ priority }: { priority: ICPPriority }) {
  const colors = {
    high: 'bg-green-500/20 text-green-400 border-green-500/30',
    medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    low: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  }

  return (
    <span
      className={cn(
        'text-xs px-2 py-0.5 rounded border',
        colors[priority]
      )}
    >
      {priority}
    </span>
  )
}

// Collapsible section component
function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className={cn(jsb.card, 'overflow-hidden')}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-jsb-navy-lighter/50 transition-colors"
      >
        <h3 className={cn(jsb.heading, 'text-base')}>{title}</h3>
        <svg
          className={cn(
            'w-5 h-5 text-gray-400 transition-transform',
            isOpen && 'rotate-180'
          )}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && <div className="px-4 pb-4 border-t border-jsb-navy-lighter">{children}</div>}
    </div>
  )
}

export default function ICPStep({
  data,
  websiteUrl,
  companyName,
  onChange,
  onNext,
  onBack,
}: Props) {
  const [researchStage, setResearchStage] = useState('Analyzing website...')
  const [researchStageIndex, setResearchStageIndex] = useState(0)
  const [showMarketResearch, setShowMarketResearch] = useState(false)
  const [isReconciling, setIsReconciling] = useState(false)
  const [reconcileStage, setReconcileStage] = useState('')
  const [showChanges, setShowChanges] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)

  // Trigger research when component mounts if not already done
  useEffect(() => {
    console.log('[ICPStep] Mount - researchStatus:', data.researchStatus, 'websiteUrl:', websiteUrl, 'companyName:', companyName)
    if (data.researchStatus === 'idle' && websiteUrl && companyName) {
      console.log('[ICPStep] Starting research...')
      runResearch()
    } else if (data.researchStatus === 'idle' && (!websiteUrl || !companyName)) {
      console.error('[ICPStep] Missing websiteUrl or companyName, cannot start research')
      onChange({
        ...data,
        researchStatus: 'error',
        researchError: 'Missing company information. Please go back and fill in company name and website URL.',
      })
    }
  }, [data.researchStatus, websiteUrl, companyName])

  async function runResearch() {
    console.log('[ICPStep] runResearch called, websiteUrl:', websiteUrl, 'companyName:', companyName)
    onChange({ ...data, researchStatus: 'loading' })
    setResearchStageIndex(0)

    try {
      // Stage 1: Analyzing website
      setResearchStage('Analyzing website and identifying outcomes...')

      console.log('[ICPStep] Calling research-icp API...')
      const response = await fetch('/api/onboarding/research-icp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ websiteUrl, companyName }),
      })

      console.log('[ICPStep] Response status:', response.status)
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || error.error || 'Research failed')
      }

      // Handle streaming response for progress updates
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let result = ''

      // Map stage messages to indices for progress display
      const stageMap: Record<string, number> = {
        'Analyzing website': 0,
        'Identifying target outcomes': 1,
        'Building account criteria': 2,
        'Creating buyer personas': 3,
        'Discovering trigger signals': 4,
        'Finalizing': 5,
      }

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value, { stream: true })
          result += chunk

          // Parse progress updates (lines starting with "stage:")
          const lines = chunk.split('\n')
          for (const line of lines) {
            if (line.startsWith('stage:')) {
              const stageText = line.replace('stage:', '').trim()
              setResearchStage(stageText)

              // Update stage index based on keywords
              for (const [key, idx] of Object.entries(stageMap)) {
                if (stageText.toLowerCase().includes(key.toLowerCase())) {
                  setResearchStageIndex(idx)
                  break
                }
              }
            }
          }
        }
      }

      // Parse final result (last line should be JSON)
      const lines = result.split('\n').filter((l) => l.trim())
      const lastLine = lines[lines.length - 1]
      console.log('[ICPStep] Parsing result, last line:', lastLine?.slice(0, 200))

      let researchResult
      try {
        researchResult = JSON.parse(lastLine)
      } catch (parseErr) {
        console.error('[ICPStep] JSON parse error:', parseErr)
        console.error('[ICPStep] Full result:', result)
        throw new Error('Failed to parse research results')
      }

      console.log('[ICPStep] Research result:', {
        hasAccountCriteria: !!researchResult.accountCriteria,
        personaCount: researchResult.personas?.length,
        triggerCount: researchResult.triggers?.length,
      })

      if (researchResult.error) {
        throw new Error(researchResult.error)
      }

      // Show success animation briefly
      setResearchStageIndex(RESEARCH_STAGES.length)
      setShowSuccess(true)

      // Small delay to show the success state
      await new Promise((resolve) => setTimeout(resolve, 1500))

      onChange({
        ...data,
        accountCriteria: researchResult.accountCriteria,
        personas: researchResult.personas,
        triggers: researchResult.triggers,
        researchStatus: 'complete',
      })
    } catch (err) {
      console.error('[ICPStep] Research error:', err)
      onChange({
        ...data,
        researchStatus: 'error',
        researchError: err instanceof Error ? err.message : 'Research failed',
      })
    }
  }

  async function runReconciliation() {
    if (!data.marketResearch.trim() || !data.accountCriteria) return

    setIsReconciling(true)
    setReconcileStage('Starting reconciliation...')

    try {
      const response = await fetch('/api/onboarding/reconcile-icp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName,
          marketResearch: data.marketResearch,
          currentICP: {
            accountCriteria: data.accountCriteria,
            personas: data.personas,
            triggers: data.triggers,
          },
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Reconciliation failed')
      }

      // Handle streaming response for progress updates
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let result = ''

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value, { stream: true })
          result += chunk

          // Parse progress updates (lines starting with "stage:")
          const lines = chunk.split('\n')
          for (const line of lines) {
            if (line.startsWith('stage:')) {
              setReconcileStage(line.replace('stage:', '').trim())
            }
          }
        }
      }

      // Parse final result (last line should be JSON)
      const lines = result.split('\n').filter((l) => l.trim())
      const lastLine = lines[lines.length - 1]
      const reconcileResult = JSON.parse(lastLine)

      if (reconcileResult.error) {
        throw new Error(reconcileResult.error)
      }

      onChange({
        ...data,
        accountCriteria: reconcileResult.accountCriteria,
        personas: reconcileResult.personas,
        triggers: reconcileResult.triggers,
        reconciled: true,
        changes: reconcileResult.changes || [],
      })

      // Show changes if any were made
      if (reconcileResult.changes?.length > 0) {
        setShowChanges(true)
      }
    } catch (err) {
      console.error('Reconciliation error:', err)
      // Don't update data on error, just show message
      alert(err instanceof Error ? err.message : 'Reconciliation failed')
    } finally {
      setIsReconciling(false)
      setReconcileStage('')
    }
  }

  // Show loading state
  if (data.researchStatus === 'loading') {
    return <ResearchingAnimation stage={researchStage} stageIndex={researchStageIndex} isComplete={showSuccess} />
  }

  // Show error state
  if (data.researchStatus === 'error') {
    return (
      <div className="space-y-6">
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30">
          <h3 className="text-red-400 font-medium mb-2">Research Failed</h3>
          <p className="text-sm text-red-300">{data.researchError}</p>
        </div>
        <div className="flex gap-3">
          <button onClick={onBack} className={cn(jsb.buttonSecondary, 'px-6 py-3')}>
            Back
          </button>
          <button
            onClick={() => runResearch()}
            className={cn(jsb.buttonPrimary, 'flex-1 py-3')}
          >
            Retry Research
          </button>
        </div>
      </div>
    )
  }

  // Show results - safely access arrays with fallbacks
  const accountCriteria = data.accountCriteria
  const personas = data.personas || []
  const triggers = data.triggers || []
  const isValid = accountCriteria && personas.length > 0 && triggers.length > 0

  return (
    <div className="space-y-6">
      <div>
        <h2 className={cn(jsb.heading, 'text-xl mb-2')}>Your Ideal Customer Profile</h2>
        <p className="text-gray-400">
          We've analyzed {websiteUrl} and generated your ICP. Review and edit as needed.
        </p>
      </div>

      {/* Account Criteria */}
      <CollapsibleSection title="Account Criteria" defaultOpen={true}>
        <div className="pt-4 space-y-4">
          {accountCriteria && (
            <>
              <CriteriaList title="Company Types" items={accountCriteria.company_types} />
              <CriteriaList title="Industries" items={accountCriteria.industries} />
              <CriteriaList title="Company Sizes" items={accountCriteria.company_sizes} />
              <CriteriaList title="Locations" items={accountCriteria.locations} />
              <CriteriaList title="Revenue Ranges" items={accountCriteria.revenue_ranges} />
              <CriteriaList title="Technologies" items={accountCriteria.technologies} />
              <CriteriaList title="Prospecting Signals" items={accountCriteria.prospecting_signals} />
            </>
          )}
        </div>
      </CollapsibleSection>

      {/* Personas */}
      <CollapsibleSection title={`Target Personas (${personas.length})`} defaultOpen={true}>
        <div className="pt-4 space-y-4">
          {personas.map((persona, index) => (
            <div key={index} className="p-4 rounded-lg bg-jsb-navy-lighter/50 space-y-2">
              <h4 className={cn(jsb.heading, 'text-sm')}>{persona.job_title}</h4>
              <div className="grid grid-cols-1 gap-2 text-sm">
                <div>
                  <span className="text-gray-500">Job to be done:</span>{' '}
                  <span className="text-gray-300">{persona.job_to_be_done}</span>
                </div>
                <div>
                  <span className="text-gray-500">Currently they:</span>{' '}
                  <span className="text-gray-300">{persona.currently_they}</span>
                </div>
                <div>
                  <span className="text-gray-500">Which results in:</span>{' '}
                  <span className="text-gray-300">{persona.which_results_in}</span>
                </div>
                <div>
                  <span className="text-gray-500">How we solve:</span>{' '}
                  <span className="text-gray-300">{persona.how_we_solve}</span>
                </div>
                <div>
                  <span className="text-gray-500">Benefits:</span>{' '}
                  <span className="text-gray-300">{persona.additional_benefits}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* Smart Triggers */}
      <CollapsibleSection title={`Smart Triggers (${triggers.length})`} defaultOpen={false}>
        <div className="pt-4 space-y-3">
          {triggers.map((trigger, index) => (
            <div key={index} className="p-4 rounded-lg bg-jsb-navy-lighter/50 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className={cn(jsb.heading, 'text-sm')}>{trigger.name}</h4>
                <span className="text-xs px-2 py-0.5 rounded bg-jsb-pink/20 text-jsb-pink">
                  {trigger.source.replace('_', ' ')}
                </span>
              </div>
              <p className="text-sm text-gray-400">{trigger.reasoning}</p>
              <div className="flex flex-wrap gap-1">
                {trigger.what_to_look_for.map((keyword, i) => (
                  <span
                    key={i}
                    className="text-xs px-2 py-0.5 rounded bg-jsb-navy-lighter text-gray-300"
                  >
                    {keyword}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* Changes Display (after reconciliation) */}
      {data.reconciled && data.changes && data.changes.length > 0 && (
        <div className={cn(jsb.card, 'p-4 border-green-500/30 bg-green-500/5')}>
          <button
            onClick={() => setShowChanges(!showChanges)}
            className="w-full flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h3 className={cn(jsb.heading, 'text-base text-green-400')}>
                  ICP Updated with Your Knowledge
                </h3>
                <p className="text-sm text-gray-400">
                  {data.changes.length} changes applied from your market research
                </p>
              </div>
            </div>
            <svg
              className={cn(
                'w-5 h-5 text-gray-400 transition-transform',
                showChanges && 'rotate-180'
              )}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showChanges && (
            <div className="mt-4 pt-4 border-t border-green-500/20 space-y-3">
              {data.changes.map((change, index) => (
                <div key={index} className="p-3 rounded-lg bg-jsb-navy-lighter/50">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs px-2 py-0.5 rounded bg-green-500/20 text-green-400 capitalize">
                      {change.category}
                    </span>
                  </div>
                  <p className="text-sm text-gray-300">{change.description}</p>
                  <p className="text-xs text-gray-500 mt-1">Because: {change.reason}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Market Research (Optional) */}
      <div className={cn(jsb.card, 'p-4')}>
        <button
          onClick={() => setShowMarketResearch(!showMarketResearch)}
          className="w-full flex items-center justify-between"
        >
          <div>
            <h3 className={cn(jsb.heading, 'text-base')}>
              {data.reconciled ? 'Edit Market Research' : 'Add Market Research'}
            </h3>
            <p className="text-sm text-gray-500">
              {data.reconciled
                ? 'Add more knowledge to further refine your ICP'
                : 'Paste case studies, customer stories, competitor notes - AI will analyze and prefer your knowledge'}
            </p>
          </div>
          <svg
            className={cn(
              'w-5 h-5 text-gray-400 transition-transform',
              showMarketResearch && 'rotate-180'
            )}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showMarketResearch && (
          <div className="mt-4 pt-4 border-t border-jsb-navy-lighter space-y-4">
            <textarea
              value={data.marketResearch}
              onChange={(e) => onChange({ ...data, marketResearch: e.target.value, reconciled: false })}
              className={cn(jsb.input, 'w-full px-4 py-3 min-h-[200px]')}
              placeholder="Paste any unstructured text here - case studies, sales notes, competitor intel, customer stories, etc.

The AI will:
• Parse and extract insights from your text
• Compare against the AI-generated ICP
• Update personas, triggers, and criteria with YOUR knowledge
• Prefer human knowledge where there are conflicts"
              disabled={isReconciling}
            />

            {/* Reconciliation button */}
            {data.marketResearch.trim() && (
              <div className="flex items-center gap-4">
                <button
                  onClick={runReconciliation}
                  disabled={isReconciling}
                  className={cn(
                    jsb.buttonPrimary,
                    'px-6 py-2.5 flex items-center gap-2',
                    isReconciling && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  {isReconciling ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/20 rounded-full animate-spin border-t-white" />
                      <span>{reconcileStage || 'Analyzing...'}</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <span>{data.reconciled ? 'Re-analyze & Update ICP' : 'Analyze & Apply to ICP'}</span>
                    </>
                  )}
                </button>
                {!isReconciling && (
                  <p className="text-xs text-gray-500">
                    AI will parse your input and update the ICP above
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex gap-3 pt-4">
        <button onClick={onBack} className={cn(jsb.buttonSecondary, 'px-6 py-3')}>
          Back
        </button>
        <button
          onClick={onNext}
          disabled={!isValid}
          className={cn(jsb.buttonPrimary, 'flex-1 py-3')}
        >
          Continue
        </button>
      </div>
    </div>
  )
}

// Helper component for criteria lists
function CriteriaList({
  title,
  items,
}: {
  title: string
  items: { value: string; priority: ICPPriority }[]
}) {
  if (!items || items.length === 0) return null

  return (
    <div>
      <h4 className="text-sm text-gray-500 mb-2">{title}</h4>
      <div className="flex flex-wrap gap-2">
        {items.map((item, index) => (
          <div
            key={index}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-jsb-navy-lighter"
          >
            <span className="text-sm text-gray-300">{item.value}</span>
            <PriorityBadge priority={item.priority} />
          </div>
        ))}
      </div>
    </div>
  )
}
