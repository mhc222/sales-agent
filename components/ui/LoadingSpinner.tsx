import { cn } from '../../lib/styles'

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizes = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
}

export function LoadingSpinner({ size = 'md', className }: LoadingSpinnerProps) {
  return (
    <div className={cn('animate-spin rounded-full border-2 border-jsb-navy-lighter border-t-jsb-pink', sizes[size], className)} />
  )
}

// Full page/section loading state
export function LoadingState({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <LoadingSpinner size="lg" />
      <p className="mt-3 text-sm text-gray-400">{message}</p>
    </div>
  )
}

// Skeleton loading placeholder
export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('animate-pulse bg-jsb-navy-lighter rounded', className)} />
  )
}

// Table row skeleton
export function TableRowSkeleton({ columns = 5 }: { columns?: number }) {
  return (
    <tr className="border-b border-jsb-navy-lighter">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton className="h-4 w-full" />
        </td>
      ))}
    </tr>
  )
}

// Card skeleton
export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('bg-jsb-navy-light border border-jsb-navy-lighter rounded-lg p-4', className)}>
      <Skeleton className="h-4 w-1/3 mb-3" />
      <Skeleton className="h-8 w-1/2 mb-2" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  )
}
