import { sourceColors, cn } from '../../lib/styles'

interface SourceBadgeProps {
  source: string
  compact?: boolean
  className?: string
}

const sourceLabels: Record<string, string> = {
  jsb_site_pixel: 'JSB Pixel',
  intent_data: 'Intent',
  audience_lab: 'Audience Lab',
  apollo_search: 'Apollo',
  linkedin_search: 'LinkedIn',
  manual: 'Manual',
}

const compactLabels: Record<string, string> = {
  jsb_site_pixel: 'Pixel',
  intent_data: 'Intent',
  audience_lab: 'Lab',
  apollo_search: 'Apollo',
  linkedin_search: 'LinkedIn',
  manual: 'Manual',
}

export function SourceBadge({ source, compact = false, className }: SourceBadgeProps) {
  const colorClass = sourceColors[source] || sourceColors.manual
  const label = compact
    ? (compactLabels[source] || source)
    : (sourceLabels[source] || source)

  return (
    <span className={cn(
      'font-medium rounded-full',
      compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs',
      colorClass,
      className
    )}>
      {label}
    </span>
  )
}
