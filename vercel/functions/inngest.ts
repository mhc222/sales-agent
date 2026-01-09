import { serve } from 'inngest/next'
import { inngest } from '../../inngest/client'
import { qualificationAndResearch } from '../../inngest/workflow1-qualification'

// Register all Inngest functions here
export default serve({
  client: inngest,
  functions: [
    qualificationAndResearch,
    // Add more workflows here as we build them:
    // deploymentAndOrchestration,  // Workflow 2
  ],
})
