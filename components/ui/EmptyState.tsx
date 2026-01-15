import { cn } from '../../lib/styles'

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-12 px-4', className)}>
      {icon && (
        <div className="p-4 bg-jsb-navy-lighter rounded-full mb-4">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-medium text-white">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-gray-400 text-center max-w-sm">{description}</p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 px-4 py-2 bg-jsb-pink text-white text-sm font-medium rounded-md hover:bg-jsb-pink-hover transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}

// Preset empty states for common scenarios
export function NoLeadsEmptyState({ onAddLead }: { onAddLead?: () => void }) {
  return (
    <EmptyState
      icon={
        <svg className="w-8 h-8 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
        </svg>
      }
      title="No leads found"
      description="Get started by adding your first lead or adjusting your filters."
      action={onAddLead ? { label: 'Add Lead', onClick: onAddLead } : undefined}
    />
  )
}

export function NoSequencesEmptyState() {
  return (
    <EmptyState
      icon={
        <svg className="w-8 h-8 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
        </svg>
      }
      title="No sequences"
      description="Sequences will appear here once leads are processed through the pipeline."
    />
  )
}

export function NoDataEmptyState({ title = 'No data yet', description }: { title?: string; description?: string }) {
  return (
    <EmptyState
      icon={
        <svg className="w-8 h-8 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
        </svg>
      }
      title={title}
      description={description || "Data will appear here once available."}
    />
  )
}
