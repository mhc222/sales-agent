import { badgeColors, cn } from '../../lib/styles'

interface QualificationBadgeProps {
  decision?: string | null
  score?: number | null
  className?: string
}

export function QualificationBadge({ decision, score, className }: QualificationBadgeProps) {
  // If we have a score, use it; otherwise fall back to decision
  // Score 70+ = qualified, everything else = not qualified
  const isQualified = score !== null && score !== undefined
    ? score >= 70
    : decision?.toUpperCase() === 'YES'

  const colorClass = isQualified ? badgeColors.success : badgeColors.error

  return (
    <span className={cn('px-2 py-1 text-xs font-medium rounded-full', colorClass, className)}>
      {isQualified ? 'yes' : 'no'}
    </span>
  )
}

// Variant with more detail
export function QualificationCard({
  decision,
  score,
  confidence,
  reasoning,
  className
}: QualificationBadgeProps & {
  confidence?: number
  reasoning?: string
}) {
  const isQualified = score !== null && score !== undefined
    ? score >= 70
    : decision?.toUpperCase() === 'YES'

  const bgColor = isQualified
    ? 'bg-emerald-500/10 border-emerald-500/20'
    : 'bg-red-500/10 border-red-500/20'

  const textColor = isQualified ? 'text-emerald-400' : 'text-red-400'

  return (
    <div className={cn('p-4 rounded-lg border', bgColor, className)}>
      <div className="flex items-center justify-between mb-2">
        <span className={cn('text-lg font-semibold', textColor)}>
          {isQualified ? 'Qualified' : 'Not Qualified'}
        </span>
        {confidence !== undefined && (
          <span className="text-xs text-gray-400">
            {Math.round(confidence * 100)}% confidence
          </span>
        )}
      </div>
      {reasoning && (
        <p className="text-sm text-gray-400 line-clamp-2">{reasoning}</p>
      )}
    </div>
  )
}
