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

// Determine if we're in development mode
const isDev = process.env.NODE_ENV === 'development'

// Register all Inngest functions here
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
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
    learningAnalysis,            // Workflow 6: Daily Learning Analysis (cron)
    manualLearningAnalysis,      // Workflow 6: Manual Learning Analysis (event)
  ],
  // In dev mode, don't use signing key (handled by Inngest dev server)
  ...(isDev ? {} : {
    signingKey: process.env.INNGEST_SIGNING_KEY,
    serveHost: 'https://sales-agent-bice.vercel.app',
  }),
})
