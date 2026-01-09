# JSB Media Autonomous Sales Agent

**Status:** Phase 1 - Foundation Complete ✅

## Architecture

- **Database:** Supabase (PostgreSQL + pgvector)
- **Orchestration:** Inngest (durable workflows)
- **Serverless:** Vercel Functions
- **AI:** Claude (Anthropic)
- **Research:** Perplexity, Apify
- **Outreach:** Smartlead (email), HeyReach (LinkedIn)

## Project Structure
```
├── supabase/migrations/         # Database schema
├── src/
│   ├── agents/                  # AI agents (Agent 1, 2, 3)
│   └── lib/                     # Shared utilities
├── inngest/                     # Workflows (Workflow 1, 2)
├── vercel/functions/            # Cron jobs & webhooks
└── docs/                        # Documentation
```

## Phase Progress

- ✅ **Phase 1:** Foundation (Schema, Agent 1, Workflow 1, Cron)
- ⏳ **Phase 2:** Research & Writing (Agent 2, Agent 3, RAG population)
- ⏳ **Phase 3:** Deployment (Workflow 2, Smartlead/HeyReach integration)
- ⏳ **Phase 4:** Orchestration (Webhook handlers, event listeners)
- ⏳ **Phase 5:** Polish (Slack, monitoring, multi-tenant)

## Quick Start
```bash
# Install dependencies
npm install

# Setup environment
cp .env.example .env.local
# Edit .env.local with your API keys

# Run locally
npm run dev

# Watch Inngest workflows
npm run inngest:dev
```

## Next Steps

**Phase 2 (Next):**
- Build Agent 2 (Perplexity + Apify research)
- Build Agent 3 (Sequence writing)
- Populate RAG with JSB Media content
- Test Workflow 1 end-to-end

See ARCHITECTURE.md for full system design.
