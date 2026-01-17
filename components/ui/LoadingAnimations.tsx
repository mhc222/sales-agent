'use client'

import { cn } from '@/lib/styles'

/**
 * Pulsing dot loader - great for inline loading indicators
 */
export function PulsingDots({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <div className="w-2 h-2 bg-jsb-pink rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
      <div className="w-2 h-2 bg-jsb-pink rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
      <div className="w-2 h-2 bg-jsb-pink rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
    </div>
  )
}

/**
 * Spinning loader with optional text
 */
export function SpinnerWithText({
  text,
  size = 'md',
  className,
}: {
  text?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const sizes = {
    sm: 'w-4 h-4 border-2',
    md: 'w-8 h-8 border-3',
    lg: 'w-12 h-12 border-4',
  }

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div
        className={cn(
          sizes[size],
          'border-jsb-pink/20 rounded-full animate-spin border-t-jsb-pink'
        )}
      />
      {text && <span className="text-gray-400 text-sm animate-pulse">{text}</span>}
    </div>
  )
}

/**
 * Progress bar with animated fill
 */
export function ProgressBar({
  progress,
  showPercent = true,
  className,
}: {
  progress: number
  showPercent?: boolean
  className?: string
}) {
  return (
    <div className={cn('w-full', className)}>
      <div className="h-2 bg-jsb-navy-lighter rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-jsb-pink to-jsb-pink-light transition-all duration-500 ease-out"
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      </div>
      {showPercent && (
        <p className="text-xs text-gray-500 mt-1 text-right">{Math.round(progress)}%</p>
      )}
    </div>
  )
}

/**
 * Shimmer skeleton for content loading
 */
export function Shimmer({
  width = '100%',
  height = '1rem',
  className,
}: {
  width?: string | number
  height?: string | number
  className?: string
}) {
  return (
    <div
      className={cn(
        'bg-gradient-to-r from-jsb-navy-lighter via-jsb-navy-light to-jsb-navy-lighter',
        'animate-shimmer bg-[length:200%_100%] rounded',
        className
      )}
      style={{ width, height }}
    />
  )
}

/**
 * Card skeleton for loading card content
 */
export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('p-4 rounded-lg bg-jsb-navy-lighter/50 space-y-3', className)}>
      <Shimmer height="1.25rem" width="60%" />
      <Shimmer height="0.875rem" width="100%" />
      <Shimmer height="0.875rem" width="80%" />
    </div>
  )
}

/**
 * Step progress indicator with animated transitions
 */
export function StepProgress({
  steps,
  currentStep,
  className,
}: {
  steps: string[]
  currentStep: number
  className?: string
}) {
  return (
    <div className={cn('space-y-3', className)}>
      {steps.map((step, index) => {
        const isComplete = index < currentStep
        const isCurrent = index === currentStep
        const isPending = index > currentStep

        return (
          <div key={index} className="flex items-center gap-3">
            <div
              className={cn(
                'w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-all duration-300',
                isComplete && 'bg-green-500 text-white',
                isCurrent && 'bg-jsb-pink text-white animate-pulse',
                isPending && 'bg-jsb-navy-lighter text-gray-500'
              )}
            >
              {isComplete ? (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                index + 1
              )}
            </div>
            <span
              className={cn(
                'text-sm transition-colors duration-300',
                isComplete && 'text-green-400',
                isCurrent && 'text-white font-medium',
                isPending && 'text-gray-500'
              )}
            >
              {step}
            </span>
            {isCurrent && (
              <div className="ml-auto">
                <PulsingDots />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/**
 * Processing animation overlay
 */
export function ProcessingOverlay({
  message,
  subMessage,
}: {
  message: string
  subMessage?: string
}) {
  return (
    <div className="fixed inset-0 bg-jsb-navy/80 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="relative w-16 h-16 mx-auto">
          <div className="absolute inset-0 border-4 border-jsb-pink/20 rounded-full" />
          <div className="absolute inset-0 border-4 border-transparent border-t-jsb-pink rounded-full animate-spin" />
          <div className="absolute inset-2 border-4 border-transparent border-t-jsb-pink-light rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
        </div>
        <div>
          <p className="text-white font-medium">{message}</p>
          {subMessage && (
            <p className="text-gray-400 text-sm mt-1 animate-pulse">{subMessage}</p>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Typing indicator animation
 */
export function TypingIndicator({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-1 px-3 py-2', className)}>
      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms', animationDuration: '0.6s' }} />
      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms', animationDuration: '0.6s' }} />
      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms', animationDuration: '0.6s' }} />
    </div>
  )
}

/**
 * Success checkmark animation
 */
export function SuccessCheck({ className }: { className?: string }) {
  return (
    <div className={cn('relative w-12 h-12', className)}>
      <div className="absolute inset-0 bg-green-500/20 rounded-full animate-ping" />
      <div className="absolute inset-0 bg-green-500 rounded-full flex items-center justify-center">
        <svg
          className="w-6 h-6 text-white animate-scale-check"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={3}
            d="M5 13l4 4L19 7"
          />
        </svg>
      </div>
    </div>
  )
}
