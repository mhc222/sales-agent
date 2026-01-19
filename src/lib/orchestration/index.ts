/**
 * Multi-Channel Orchestration Module
 * Exports all orchestration types, functions, and utilities
 */

// Types
export * from './types'

// Orchestrator functions
export {
  // State management
  getOrchestrationState,
  createOrchestrationState,
  updateOrchestrationState,

  // Event processing
  processEvent,
  logOrchestrationEvent,

  // Sequence access
  getSequence,
  getNextEmailStep,
  getNextLinkedInStep,
  getEmailContent,
  getLinkedInContent,

  // Platform execution
  executeEmailSend,
  executeLinkedInAction,

  // Orchestration control
  startOrchestration,
  pauseOrchestration,
  stopOrchestration,
  markConverted,

  // Triggers
  getApplicableTriggers,
} from './orchestrator'
