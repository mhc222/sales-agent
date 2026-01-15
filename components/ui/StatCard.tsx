import { cn } from '../../lib/styles'

interface StatCardProps {
  label: string
  value: string | number
  change?: number
  changeLabel?: string
  icon?: React.ReactNode
  className?: string
}

export function StatCard({ label, value, change, changeLabel, icon, className }: StatCardProps) {
  const isPositive = change !== undefined && change > 0
  const isNegative = change !== undefined && change < 0

  return (
    <div className={cn(
      'bg-jsb-navy-light border border-jsb-navy-lighter rounded-lg p-5',
      className
    )}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-400 font-medium">{label}</p>
          <p className="text-3xl font-bold text-white mt-1">{value}</p>
        </div>
        {icon && (
          <div className="p-2 bg-jsb-navy-lighter rounded-lg">
            {icon}
          </div>
        )}
      </div>
      {change !== undefined && (
        <div className="mt-3 flex items-center gap-1.5">
          {isPositive && (
            <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
            </svg>
          )}
          {isNegative && (
            <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 4.5l15 15m0 0V8.25m0 11.25H8.25" />
            </svg>
          )}
          <span className={cn(
            'text-sm font-medium',
            isPositive ? 'text-emerald-400' : isNegative ? 'text-red-400' : 'text-gray-400'
          )}>
            {isPositive ? '+' : ''}{change}%
          </span>
          {changeLabel && (
            <span className="text-xs text-gray-500">{changeLabel}</span>
          )}
        </div>
      )}
    </div>
  )
}

// Compact variant for inline stats
export function StatBadge({ label, value, className }: Omit<StatCardProps, 'change' | 'changeLabel' | 'icon'>) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="text-xs text-gray-500 uppercase tracking-wider">{label}</span>
      <span className="text-sm font-semibold text-white">{value}</span>
    </div>
  )
}
