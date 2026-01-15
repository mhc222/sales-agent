// JSB Media Design System - Shared style utilities
// Used across all components for consistent styling

export const jsb = {
  // Cards
  card: 'bg-jsb-navy-light border border-jsb-navy-lighter rounded-lg',
  cardHover: 'hover:bg-jsb-navy-lighter transition-colors duration-150',
  cardInteractive: 'bg-jsb-navy-light border border-jsb-navy-lighter rounded-lg hover:bg-jsb-navy-lighter hover:border-jsb-navy-lighter transition-all duration-150 cursor-pointer',

  // Buttons
  buttonPrimary: 'bg-jsb-pink text-white font-medium rounded-md hover:bg-jsb-pink-hover transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed',
  buttonSecondary: 'bg-jsb-navy-lighter text-gray-300 font-medium rounded-md border border-jsb-navy-lighter hover:bg-jsb-navy hover:text-white transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed',
  buttonGhost: 'text-gray-400 hover:text-white hover:bg-jsb-navy-lighter rounded-md transition-colors duration-150',
  buttonDanger: 'bg-red-500/20 text-red-400 font-medium rounded-md border border-red-500/30 hover:bg-red-500/30 transition-colors duration-150',

  // Inputs
  input: 'bg-jsb-navy border border-jsb-navy-lighter rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-jsb-pink focus:border-transparent transition-all duration-150',
  select: 'bg-jsb-navy border border-jsb-navy-lighter rounded-md text-white focus:outline-none focus:ring-2 focus:ring-jsb-pink focus:border-transparent cursor-pointer',

  // Tables
  table: 'w-full divide-y divide-jsb-navy-lighter',
  tableHeader: 'bg-jsb-navy-lighter/50',
  tableHeaderCell: 'px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider',
  tableRow: 'hover:bg-jsb-navy-lighter/30 transition-colors duration-100',
  tableCell: 'px-4 py-3 text-sm text-gray-300',

  // Navigation
  navItem: 'flex items-center gap-3 px-3 py-2 text-gray-400 rounded-md hover:bg-jsb-navy-lighter hover:text-white transition-colors duration-150',
  navItemActive: 'flex items-center gap-3 px-3 py-2 text-white bg-jsb-navy-lighter rounded-md',

  // Badges
  badge: 'inline-flex items-center px-2 py-1 text-xs font-medium rounded-full',

  // Text
  heading: 'text-white font-semibold',
  subheading: 'text-gray-400 text-sm',
  label: 'text-gray-400 text-xs uppercase tracking-wider font-medium',

  // Layout
  page: 'min-h-screen bg-jsb-navy',
  container: 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8',
  section: 'bg-jsb-navy-light border border-jsb-navy-lighter rounded-lg p-6',
}

// Badge color variants
export const badgeColors = {
  // Status badges
  success: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
  warning: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
  error: 'bg-red-500/20 text-red-400 border border-red-500/30',
  info: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  neutral: 'bg-gray-500/20 text-gray-400 border border-gray-500/30',
  pink: 'bg-jsb-pink/20 text-jsb-pink border border-jsb-pink/30',
  purple: 'bg-purple-500/20 text-purple-400 border border-purple-500/30',
  cyan: 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30',
  orange: 'bg-orange-500/20 text-orange-400 border border-orange-500/30',
  teal: 'bg-teal-500/20 text-teal-400 border border-teal-500/30',
  violet: 'bg-violet-500/20 text-violet-400 border border-violet-500/30',
  sky: 'bg-sky-500/20 text-sky-400 border border-sky-500/30',
}

// Status-specific colors for pipeline stages
export const statusColors: Record<string, string> = {
  new: badgeColors.neutral,
  ingested: badgeColors.neutral,
  low_score: 'bg-gray-600/20 text-gray-500 border border-gray-600/30',
  qualified: badgeColors.info,
  researched: badgeColors.purple,
  sequence_ready: badgeColors.warning,
  deployed: badgeColors.success,
  paused: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  cancelled: badgeColors.error,
  replied: badgeColors.cyan,
  interested: badgeColors.pink,
  meeting_booked: badgeColors.pink,
  human_review: badgeColors.orange,
  disqualified: badgeColors.error,
  nurture: badgeColors.teal,
  unsubscribed: badgeColors.error,
}

// Source-specific colors
export const sourceColors: Record<string, string> = {
  jsb_site_pixel: badgeColors.pink,
  intent_data: badgeColors.orange,
  audience_lab: badgeColors.teal,
  apollo_search: badgeColors.violet,
  linkedin_search: badgeColors.sky,
  manual: badgeColors.neutral,
}

// Helper to combine class names
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}
