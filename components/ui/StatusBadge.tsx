import { statusColors, cn } from '../../lib/styles'

interface StatusBadgeProps {
  status: string
  className?: string
}

const statusLabels: Record<string, string> = {
  new: 'new',
  ingested: 'new',
  low_score: 'low',
  qualified: 'ready',
  researched: 'researched',
  sequence_ready: 'seq ready',
  deployed: 'deployed',
  paused: 'paused',
  cancelled: 'cancelled',
  replied: 'replied',
  interested: 'interested',
  meeting_booked: 'booked',
  human_review: 'review',
  disqualified: 'disqualified',
  nurture: 'nurture',
  unsubscribed: 'unsubscribed',
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const colorClass = statusColors[status] || statusColors.new
  const label = statusLabels[status] || status.replace(/_/g, ' ')

  return (
    <span className={cn('px-2 py-1 text-xs font-medium rounded-full', colorClass, className)}>
      {label}
    </span>
  )
}
