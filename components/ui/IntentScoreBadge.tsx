import { cn } from '../../lib/styles'

interface IntentScoreBadgeProps {
  score: number | null
  showLabel?: boolean
  compact?: boolean
  className?: string
}

export function IntentScoreBadge({ score, showLabel = false, compact = false, className }: IntentScoreBadgeProps) {
  if (score === null) {
    return <span className="text-gray-500">{compact ? '' : '-'}</span>
  }

  const bgColor = score >= 70
    ? 'bg-emerald-500/20 text-emerald-400'
    : score >= 40
    ? 'bg-yellow-500/20 text-yellow-400'
    : 'bg-red-500/20 text-red-400'

  const color = score >= 70
    ? 'text-emerald-400'
    : score >= 40
    ? 'text-yellow-400'
    : 'text-red-400'

  const tier = score >= 70 ? 'Strong' : score >= 40 ? 'Medium' : 'Weak'

  if (compact) {
    return (
      <span className={cn('px-1.5 py-0.5 text-xs font-bold rounded', bgColor, className)}>
        {score}
      </span>
    )
  }

  return (
    <span className={cn('font-medium', color, className)}>
      {score}
      {showLabel && <span className="text-xs ml-1 opacity-75">({tier})</span>}
    </span>
  )
}

// Variant with background for emphasis
export function IntentScoreCard({ score, className }: IntentScoreBadgeProps) {
  if (score === null) {
    return (
      <div className={cn('px-3 py-2 bg-jsb-navy-lighter rounded-lg text-center', className)}>
        <span className="text-gray-500 text-sm">No score</span>
      </div>
    )
  }

  const bgColor = score >= 70
    ? 'bg-emerald-500/10 border-emerald-500/20'
    : score >= 40
    ? 'bg-yellow-500/10 border-yellow-500/20'
    : 'bg-red-500/10 border-red-500/20'

  const textColor = score >= 70
    ? 'text-emerald-400'
    : score >= 40
    ? 'text-yellow-400'
    : 'text-red-400'

  const tier = score >= 70 ? 'Strong Fit' : score >= 40 ? 'Medium Fit' : 'Weak Fit'

  return (
    <div className={cn('px-3 py-2 rounded-lg border', bgColor, className)}>
      <div className={cn('text-2xl font-bold', textColor)}>{score}</div>
      <div className="text-xs text-gray-400 mt-0.5">{tier}</div>
    </div>
  )
}
