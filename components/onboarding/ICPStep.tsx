'use client'

import { useEffect, useState } from 'react'
import { jsb, cn } from '@/lib/styles'
import type {
  AccountCriteria,
  ICPPersona,
  ICPTrigger,
  ICPPriority,
} from '@/src/lib/tenant-settings'

type ICPData = {
  accountCriteria: AccountCriteria | null
  personas: ICPPersona[]
  triggers: ICPTrigger[]
  researchStatus: 'idle' | 'loading' | 'complete' | 'error'
  researchError?: string
  marketResearch: string
}

type Props = {
  data: ICPData
  websiteUrl: string
  companyName: string
  onChange: (data: ICPData) => void
  onNext: () => void
  onBack: () => void
}

// Loading animation component
function ResearchingAnimation({ stage }: { stage: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 space-y-6">
      <div className="relative">
        <div className="w-16 h-16 border-4 border-jsb-pink/20 rounded-full animate-spin border-t-jsb-pink" />
      </div>
      <div className="text-center space-y-2">
        <h3 className={cn(jsb.heading, 'text-lg')}>Researching your business...</h3>
        <p className="text-gray-400 text-sm">{stage}</p>
      </div>
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
  const [showMarketResearch, setShowMarketResearch] = useState(false)

  // Trigger research when component mounts if not already done
  useEffect(() => {
    if (data.researchStatus === 'idle') {
      runResearch()
    }
  }, [])

  async function runResearch() {
    onChange({ ...data, researchStatus: 'loading' })

    try {
      // Stage 1: Analyzing website
      setResearchStage('Analyzing website and identifying outcomes...')

      const response = await fetch('/api/onboarding/research-icp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ websiteUrl, companyName }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Research failed')
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
              setResearchStage(line.replace('stage:', '').trim())
            }
          }
        }
      }

      // Parse final result (last line should be JSON)
      const lines = result.split('\n').filter((l) => l.trim())
      const lastLine = lines[lines.length - 1]
      const researchResult = JSON.parse(lastLine)

      onChange({
        ...data,
        accountCriteria: researchResult.accountCriteria,
        personas: researchResult.personas,
        triggers: researchResult.triggers,
        researchStatus: 'complete',
      })
    } catch (err) {
      onChange({
        ...data,
        researchStatus: 'error',
        researchError: err instanceof Error ? err.message : 'Research failed',
      })
    }
  }

  // Show loading state
  if (data.researchStatus === 'loading') {
    return <ResearchingAnimation stage={researchStage} />
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

  // Show results
  const { accountCriteria, personas, triggers } = data
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

      {/* Market Research (Optional) */}
      <div className={cn(jsb.card, 'p-4')}>
        <button
          onClick={() => setShowMarketResearch(!showMarketResearch)}
          className="w-full flex items-center justify-between"
        >
          <div>
            <h3 className={cn(jsb.heading, 'text-base')}>Add Market Research</h3>
            <p className="text-sm text-gray-500">
              Optional: Paste case studies, customer stories, competitor notes
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
          <div className="mt-4 pt-4 border-t border-jsb-navy-lighter">
            <textarea
              value={data.marketResearch}
              onChange={(e) => onChange({ ...data, marketResearch: e.target.value })}
              className={cn(jsb.input, 'w-full px-4 py-3 min-h-[200px]')}
              placeholder="Paste any unstructured text here - case studies, sales notes, competitor intel, customer stories, etc. We'll parse and organize it automatically."
            />
            <p className="text-xs text-gray-500 mt-2">
              This data will be stored in your tenant-specific knowledge base for personalization.
            </p>
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
