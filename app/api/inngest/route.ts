import { serve } from 'inngest/next'
import { inngest } from '../../../inngest/client'
import { intentQualification } from '../../../inngest/workflow0-intent-qualification'
import { qualificationAndResearch } from '../../../inngest/workflow1-qualification'
import { researchPipeline } from '../../../inngest/workflow2-deployment'
import { sequencingPipeline } from '../../../inngest/workflow3-sequencing'
import { sequenceRevision, reviewRevisedSequence } from '../../../inngest/workflow3b-revision'
import { smartleadDeployment, manualSmartleadDeployment } from '../../../inngest/workflow4-smartlead'
import {
  replyClassification,
  highEngagementHandler,
  interestedNotification,
  ghlUnsubscribeSync,
} from '../../../inngest/workflow5-email-responses'
import { learningAnalysis, manualLearningAnalysis } from '../../../inngest/workflow6-learning'
import {
  generateAndDeploySequence,
  executeNextStep,
  handleSmartleadEvent,
  handleHeyReachEvent,
  checkWaitingTimeouts,
} from '../../../inngest/orchestration-workflows'
import {
  cronDailyAudienceLab,
  cronDailyStats,
  cronLearningAnalysis,
  cronApolloSavedSearches,
  cronNureplySync,
  cronHeyReachSync,
  cronCampaignDataIngestion,
} from '../../../inngest/cron-jobs'
import {
  campaignIngestion,
  manualCampaignIngestion,
} from '../../../inngest/workflow0-campaign-ingestion'

// Determine if we're in development mode
const isDev = process.env.NODE_ENV === 'development'

// Register all Inngest functions here
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    // Event-driven workflows
    intentQualification,         // Workflow 0: Intent Data Qualification
    qualificationAndResearch,    // Workflow 1: Pixel Visitor Qualification
    researchPipeline,            // Workflow 2: Research & Deployment
    sequencingPipeline,          // Workflow 3: Email Sequence Generation
    sequenceRevision,            // Workflow 3b: Email Sequence Revision
    reviewRevisedSequence,       // Workflow 3c: Review Revised Sequence
    smartleadDeployment,         // Workflow 4: Smartlead Deployment
    manualSmartleadDeployment,   // Manual trigger for dashboard
    replyClassification,         // Workflow 5: Email reply classification
    highEngagementHandler,       // Workflow 5: High engagement notifications
    interestedNotification,      // Workflow 5: Interested lead Slack alerts
    ghlUnsubscribeSync,          // Workflow 5: GHL unsubscribe sync
    learningAnalysis,            // Workflow 6: Daily Learning Analysis
    manualLearningAnalysis,      // Workflow 6: Manual Learning Analysis (event)
    // Multi-channel orchestration workflows
    generateAndDeploySequence,   // Orchestration: Generate multi-channel sequence
    executeNextStep,             // Orchestration: Execute sequence steps
    handleSmartleadEvent,        // Orchestration: Process Smartlead webhooks
    handleHeyReachEvent,         // Orchestration: Process HeyReach webhooks
    checkWaitingTimeouts,        // Orchestration: Cron for waiting timeouts
    // Scheduled cron jobs
    cronDailyAudienceLab,        // Cron: Daily AudienceLab ingestion - all sources per tenant (9am UTC)
    cronDailyStats,              // Cron: Daily stats & Slack summary (8am UTC)
    cronLearningAnalysis,        // Cron: Trigger learning analysis (6am UTC)
    cronApolloSavedSearches,     // Cron: Apollo saved searches (11am UTC)
    cronNureplySync,             // Cron: Nureply engagement polling (every 15 min)
    cronHeyReachSync,            // Cron: HeyReach LinkedIn polling (every 15 min)
    // Campaign-centric ingestion (new architecture)
    cronCampaignDataIngestion,   // Cron: Campaign data ingestion (6am UTC)
    campaignIngestion,           // Workflow 0: Campaign-based data ingestion
    manualCampaignIngestion,     // Manual trigger for campaign ingestion
  ],
  // In dev mode, don't use signing key (handled by Inngest dev server)
  ...(isDev ? {} : {
    signingKey: process.env.INNGEST_SIGNING_KEY,
    serveHost: 'https://sales-agent-bice.vercel.app',
  }),
})
