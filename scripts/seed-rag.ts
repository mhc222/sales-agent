/**
 * Seed RAG Documents for JSB Media
 *
 * Populates the rag_documents table with company context, qualification rules,
 * messaging guidelines, and industry context for AI agents.
 *
 * Usage:
 *   npx ts-node scripts/seed-rag.ts
 *   npx ts-node scripts/seed-rag.ts --clear  # Clear existing docs first
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

// Load environment variables first
config({ path: '.env.local' })
config({ path: '.env' }) // Fallback to .env if .env.local doesn't have all vars

// Validate environment variables
const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing required environment variables:')
  console.error('  SUPABASE_URL:', supabaseUrl ? '✓' : '✗ MISSING')
  console.error('  SUPABASE_SERVICE_ROLE_KEY:', supabaseKey ? '✓' : '✗ MISSING')
  process.exit(1)
}

const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey)

// RAG document types
type RagType = 'shared' | 'qualification' | 'messaging' | 'industry' | 'persona' | 'icp'

interface RagDocument {
  rag_type: RagType
  content: string
  metadata: Record<string, unknown>
}

// ============================================================================
// RAG DOCUMENTS
// ============================================================================

const ragDocuments: RagDocument[] = [
  // ===========================================================================
  // SHARED DOCUMENTS (All agents access)
  // ===========================================================================
  {
    rag_type: 'shared',
    content: `JSB Media is a performance marketing agency specializing in mid-market companies ($10M-$500M revenue) operating in competitive, high-volume industries. We help marketing teams that are activating multiple channels but struggling with cohesive execution and ROI measurement.

Core services:
- Multi-channel campaign orchestration
- Marketing attribution and measurement
- Audience development and identity resolution
- Content strategy and production
- Paid media management (search, social, programmatic)

We work with companies scaling across multiple locations or channels who lack the marketing sophistication to compete against larger players with bigger budgets and dedicated teams.`,
    metadata: { category: 'company', priority: 'high' },
  },
  {
    rag_type: 'shared',
    content: `Ideal Customer Profile for JSB Media:

Company Characteristics:
- Revenue: $10M - $500M annually
- Industries: QSR/restaurants, e-commerce, travel, hospitality, franchises, home services, B2B SaaS, retail, consumer brands
- Multiple locations OR multiple marketing channels active
- Growing but hitting marketing scaling challenges
- Currently spending on marketing but not seeing clear ROI

Buyer Personas (Decision Makers):
- CMO / VP Marketing: Strategic buyer, cares about attribution and proving ROI to CEO/board
- Marketing Director: Day-to-day owner, overwhelmed by channel complexity
- Growth Manager: Focused on customer acquisition cost and scaling what works
- Franchise Owner/Operator: Needs corporate-quality marketing at local level
- VP Sales: Cares about lead quality and marketing-sales alignment

Agency Prospects (Conditional Fit):
- Creative agencies needing media/performance partner: GOOD FIT
- Media agencies needing additional capacity: GOOD FIT
- Full-service agencies offering same services: Evaluate based on intent signals
- Determine fit based on their intent signals and trigger events, not agency status alone

Disqualifying Signals:
- Company revenue under $5M (too early stage)
- Company revenue over $750M (enterprise, different needs)
- Already has 10+ person in-house marketing team
- Industries we don't serve: healthcare, financial services, government, non-profit
- Person is in a sales role (they're selling to us, not buying)`,
    metadata: { category: 'icp', priority: 'high' },
  },
  {
    rag_type: 'shared',
    content: `Pain Point: Fragmented Marketing Channels
Value Prop: We unify your marketing channels into a single orchestrated strategy. No more siloed agencies or disconnected campaigns. One team, one dashboard, one growth plan.

Pain Point: Can't Prove Marketing ROI
Value Prop: Our attribution system shows exactly which dollars drive which customers. Stop guessing, start knowing. We've helped clients identify 40% of their spend was going to zero-return channels.

Pain Point: Scaling Across Locations
Value Prop: We've built playbooks for multi-location brands that let you scale what works without reinventing the wheel at each location. Corporate strategy, local execution.

Pain Point: Competing Against Bigger Players
Value Prop: You don't need a Fortune 500 budget to run Fortune 500 marketing. We bring enterprise strategies to mid-market budgets through smart automation and focused execution.

Pain Point: Marketing Team Overwhelmed
Value Prop: Think of us as your marketing team's force multiplier. We handle the execution complexity so your team can focus on strategy and stakeholder management.

Pain Point: Agency Needs Capacity/Expertise
Value Prop: We partner with agencies who need performance marketing firepower. White-label or collaborative - we flex to your client relationships.`,
    metadata: { category: 'value_props', priority: 'high' },
  },
  {
    rag_type: 'shared',
    content: `Client: Regional QSR chain (45 locations, $28M revenue)

Challenge: Marketing was location-by-location with no coordination. Each franchisee doing their own thing. No idea what was working.

Solution: Unified their digital presence, built location-aware campaigns, implemented attribution tracking.

Results:
- 34% increase in same-store sales attributed to marketing
- 28% reduction in customer acquisition cost
- Franchisee satisfaction with marketing went from 2.1 to 4.3 (out of 5)

Timeline: 6 months to full implementation, ROI positive by month 4.`,
    metadata: { category: 'success_story', industry: 'qsr', priority: 'medium' },
  },
  {
    rag_type: 'shared',
    content: `Client: E-commerce home goods brand ($18M revenue, DTC + Amazon)

Challenge: Couldn't tell which marketing drove DTC vs Amazon sales. Scaling ad spend but margins shrinking.

Solution: Built unified attribution across channels, identified top-performing audiences, reallocated spend to highest-ROI channels.

Results:
- 52% improvement in ROAS
- Identified that 35% of ad spend was cannibalizing Amazon organic sales
- Grew DTC mix from 30% to 48% of revenue

Timeline: 3 months to attribution clarity, 6 months to full optimization.`,
    metadata: { category: 'success_story', industry: 'ecommerce', priority: 'medium' },
  },

  // ===========================================================================
  // QUALIFICATION DOCUMENTS (Agent 1 uses)
  // ===========================================================================
  {
    rag_type: 'qualification',
    content: `STRONG FIT signals (qualify YES):
- Title contains: CMO, VP Marketing, Marketing Director, Growth, Franchise, Head of Marketing, Brand
- Company size: 50-2000 employees
- Industry match: restaurants, food service, hospitality, hotels, travel, e-commerce, retail, home services, franchise, SaaS, software, consumer brands
- Multiple locations mentioned in company description
- Recent hiring in marketing roles
- Website shows multiple marketing channels active (paid ads, social, email)
- Agency looking for capacity or specialty partner (check intent signals)

WEAK FIT signals (qualify REVIEW):
- Title is Manager level (not Director+)
- Company size 20-50 or 2000-5000
- Adjacent industry
- Single location but scaling
- Job title ambiguous
- Agency with unclear intent (needs more research on what they're looking for)

DISQUALIFY signals (qualify NO):
- Title indicates sales role: Sales Rep, SDR, BDR, Account Executive, Sales Manager, Account Manager, Business Development (they're selling to us)
- Title: Intern, Coordinator, Assistant
- Company size: Under 20 employees or over 5000
- Industry: healthcare, financial services, insurance, government, education, non-profit
- Company is in our CRM as "bad fit" or "do not contact"
- Email domain is personal (gmail, yahoo, hotmail)

IMPORTANT - Agencies Are Not Auto-Disqualified:
- Creative agencies often need media/performance partners - POTENTIAL FIT
- Media agencies may need capacity or specialty expertise - POTENTIAL FIT
- Evaluate agencies based on their intent signals and what pages they visited
- Look for signals like: visited services page, pricing page, case studies
- A creative agency CMO visiting our site is likely looking for a partner, not competitor research`,
    metadata: { category: 'qualification_rules', priority: 'high' },
  },

  // ===========================================================================
  // MESSAGING DOCUMENTS (Agent 3 uses)
  // ===========================================================================
  {
    rag_type: 'messaging',
    content: `JSB Media Email Philosophy - The 95/5 Rule:

95% Human Touch:
- Lead with genuine recognition of their work, role, or company
- Reference specific details from research (recent news, LinkedIn posts, company milestones)
- Show you understand their challenges before mentioning solutions
- Ask thoughtful questions about their situation
- Be conversational, not corporate

5% Soft Positioning:
- Brief mention of who we are (one sentence max)
- Subtle connection to their challenge (not a pitch)
- Soft CTA: curiosity-based, not meeting-focused
- Example: "Curious if this resonates with what you're seeing?" not "Let's schedule a call"

What We NEVER Do:
- "Hope this email finds you well"
- "I wanted to reach out because..."
- "We help companies like yours..."
- Fake familiarity ("I've been following your work...")
- Long paragraphs about our services
- Hard CTAs in first email ("Are you free Thursday?")
- Claims without specifics ("We've helped hundreds of companies...")`,
    metadata: { category: 'email_principles', priority: 'high' },
  },
  {
    rag_type: 'messaging',
    content: `Effective Subject Lines (use these patterns):
- [Specific observation] + [curiosity gap]: "Your Denver expansion + a pattern we've seen"
- [Congratulations hook]: "Congrats on the Series B - quick thought"
- [Mutual connection/context]: "Fellow [industry] marketing nerd here"
- [Specific + simple]: "Quick question about [company]'s attribution"
- [Pattern interrupt]: "Not another agency pitch"

Avoid:
- Generic: "Partnership opportunity"
- Salesy: "Boost your marketing ROI by 50%"
- Clickbait: "You won't believe this marketing hack"
- Long: Anything over 6 words
- ALL CAPS or excessive punctuation`,
    metadata: { category: 'subject_lines', priority: 'medium' },
  },
  {
    rag_type: 'messaging',
    content: `Phrases and patterns to NEVER use in JSB Media emails:

Opening Lines to Avoid:
- "Hope this email finds you well"
- "I came across your profile and..."
- "I wanted to reach out because..."
- "My name is [X] and I work at..."
- "I noticed that your company..."

Claims to Avoid:
- Vague superlatives: "industry-leading", "best-in-class", "cutting-edge"
- Unsubstantiated claims: "We've helped hundreds of companies"
- Generic benefits: "save time and money", "grow your business"

Tone to Avoid:
- Overly formal: "I would be delighted to discuss..."
- Desperate: "I'd love just 15 minutes of your time"
- Presumptuous: "I know you're struggling with..."
- Sycophantic: "I'm such a huge fan of your work"

Structure to Avoid:
- More than 150 words in first email
- More than 2 paragraphs
- Bullet points listing our services
- Multiple CTAs
- P.S. lines with additional pitches`,
    metadata: { category: 'anti_patterns', priority: 'high' },
  },

  // ===========================================================================
  // INDUSTRY DOCUMENTS (Agent 3 uses for personalization)
  // ===========================================================================
  {
    rag_type: 'industry',
    content: `Industry: QSR / Quick Service Restaurants

Common Pain Points:
- Franchisee marketing is fragmented and inconsistent
- Local store marketing competes with national campaigns
- Delivery app fees eating into margins, need to drive direct orders
- Labor shortage making customer experience inconsistent
- Can't attribute foot traffic to digital marketing

Trigger Events:
- New location openings
- Franchise expansion announcements
- New menu launches
- Delivery partnership announcements
- Leadership changes in marketing

Relevant Talking Points:
- Location-aware digital campaigns
- Unified franchisee marketing portals
- Direct ordering vs third-party attribution
- Local SEO and Google Business Profile optimization`,
    metadata: { category: 'industry_context', industry: 'qsr', priority: 'medium' },
  },
  {
    rag_type: 'industry',
    content: `Industry: E-commerce / DTC Brands

Common Pain Points:
- Rising customer acquisition costs (Meta, Google getting expensive)
- Amazon vs DTC channel conflict
- Attribution across touchpoints is broken
- iOS privacy changes killed their tracking
- Retargeting audiences shrinking

Trigger Events:
- Funding announcements (need to scale)
- New product launches
- Amazon fee increases
- Platform migrations (Shopify, etc)
- Hiring growth/marketing roles

Relevant Talking Points:
- First-party data strategies
- Channel mix optimization
- Post-iOS14 attribution solutions
- Amazon advertising vs DTC investment balance`,
    metadata: { category: 'industry_context', industry: 'ecommerce', priority: 'medium' },
  },
  {
    rag_type: 'industry',
    content: `Industry: Home Services (HVAC, Plumbing, Roofing, etc.)

Common Pain Points:
- Lead gen services (Angi, HomeAdvisor) are expensive and low quality
- Seasonal demand swings
- Local competition from both big franchises and small operators
- Reviews and reputation management
- Technician capacity planning vs marketing spend

Trigger Events:
- Geographic expansion
- Seasonal peaks approaching
- Competitor acquisition news
- New service line additions
- Franchise growth

Relevant Talking Points:
- Owned lead generation vs rented leads
- Local SEO dominance
- Review generation systems
- Seasonal campaign planning
- Service area expansion playbooks`,
    metadata: { category: 'industry_context', industry: 'home_services', priority: 'medium' },
  },
  {
    rag_type: 'industry',
    content: `Industry: B2B SaaS

Common Pain Points:
- CAC payback getting longer
- Demo-to-close conversion dropping
- Content marketing not driving pipeline
- ABM programs underperforming
- PLG and sales-led motion conflict

Trigger Events:
- Funding rounds (Series A/B especially)
- New product launches
- Market expansion announcements
- CMO/VP Marketing new hires
- Competitive pressure announcements

Relevant Talking Points:
- Full-funnel attribution
- Content that converts vs content for SEO
- ABM program optimization
- Demand gen efficiency
- Pipeline velocity improvement`,
    metadata: { category: 'industry_context', industry: 'saas', priority: 'medium' },
  },
  {
    rag_type: 'industry',
    content: `Industry: Marketing Agencies (as partners/clients)

When Agencies Are Good Prospects:
- Creative agencies needing performance/media expertise
- Media agencies needing overflow capacity
- Boutique agencies wanting to offer more services
- Agencies with clients in our sweet spot industries

Common Pain Points:
- Client demanding performance marketing they can't deliver in-house
- Capacity constraints during busy periods
- Need specialty expertise (attribution, programmatic, etc.)
- Want to expand service offerings without hiring

Trigger Events:
- New client wins in our industries
- Hiring for roles they struggle to fill
- Leadership visiting our site (signal they're evaluating partners)
- Service expansion announcements

Relevant Talking Points:
- White-label partnership options
- Capacity overflow arrangements
- Specialty expertise on demand
- Client success stories we can reference`,
    metadata: { category: 'industry_context', industry: 'agency', priority: 'medium' },
  },
]

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function getOrCreateTenant(): Promise<string> {
  // Check for existing tenant
  const { data: existingTenants, error: fetchError } = await supabase
    .from('tenants')
    .select('id, name')
    .limit(1)

  if (fetchError) {
    console.error('Error fetching tenants:', fetchError)
    throw fetchError
  }

  if (existingTenants && existingTenants.length > 0) {
    console.log(`Using existing tenant: ${existingTenants[0].name} (${existingTenants[0].id})`)
    return existingTenants[0].id
  }

  // Create a new tenant if none exists
  console.log('No tenant found, creating default tenant...')
  const { data: newTenant, error: createError } = await supabase
    .from('tenants')
    .insert({
      name: 'JSB Media',
      domain: 'jsbmedia.com',
    })
    .select('id')
    .single()

  if (createError) {
    console.error('Error creating tenant:', createError)
    throw createError
  }

  console.log(`Created new tenant: JSB Media (${newTenant.id})`)
  return newTenant.id
}

async function clearExistingDocuments(tenantId: string): Promise<void> {
  console.log('\nClearing existing RAG documents...')
  const { error } = await supabase
    .from('rag_documents')
    .delete()
    .eq('tenant_id', tenantId)

  if (error) {
    console.error('Error clearing documents:', error)
    throw error
  }
  console.log('Existing documents cleared.')
}

async function seedDocuments(tenantId: string): Promise<void> {
  console.log(`\nSeeding ${ragDocuments.length} RAG documents...`)

  const documentsWithTenant = ragDocuments.map((doc) => ({
    tenant_id: tenantId,
    rag_type: doc.rag_type,
    content: doc.content,
    metadata: doc.metadata,
  }))

  const { data, error } = await supabase
    .from('rag_documents')
    .insert(documentsWithTenant)
    .select('id, rag_type')

  if (error) {
    console.error('Error seeding documents:', error)
    throw error
  }

  console.log(`Successfully inserted ${data.length} documents.`)
}

async function validateDocuments(tenantId: string): Promise<void> {
  console.log('\nValidating document counts...')

  const expectedCounts: Record<RagType, number> = {
    shared: 5,
    qualification: 1,
    messaging: 3,
    industry: 5,
    persona: 0,
    icp: 0,
  }

  const { data, error } = await supabase
    .from('rag_documents')
    .select('rag_type')
    .eq('tenant_id', tenantId)

  if (error) {
    console.error('Error validating:', error)
    throw error
  }

  const actualCounts: Record<string, number> = {}
  for (const doc of data) {
    actualCounts[doc.rag_type] = (actualCounts[doc.rag_type] || 0) + 1
  }

  console.log('\n┌────────────────┬──────────┬────────┐')
  console.log('│ RAG Type       │ Expected │ Actual │')
  console.log('├────────────────┼──────────┼────────┤')

  let allValid = true
  for (const [ragType, expected] of Object.entries(expectedCounts)) {
    if (expected === 0) continue
    const actual = actualCounts[ragType] || 0
    const status = actual === expected ? '✓' : '✗'
    console.log(`│ ${ragType.padEnd(14)} │ ${String(expected).padStart(8)} │ ${String(actual).padStart(6)} │ ${status}`)
    if (actual !== expected) allValid = false
  }

  console.log('└────────────────┴──────────┴────────┘')

  if (allValid) {
    console.log('\n✅ All document counts match expected values!')
  } else {
    console.log('\n⚠️  Document counts do not match. Please check.')
  }
}

async function main() {
  const clearFlag = process.argv.includes('--clear')

  console.log('═══════════════════════════════════════')
  console.log('  JSB Media RAG Document Seeder')
  console.log('═══════════════════════════════════════')

  try {
    // Get or create tenant
    const tenantId = await getOrCreateTenant()

    // Clear existing documents if flag is set
    if (clearFlag) {
      await clearExistingDocuments(tenantId)
    }

    // Seed documents
    await seedDocuments(tenantId)

    // Validate
    await validateDocuments(tenantId)

    console.log('\n✅ RAG seeding complete!')
  } catch (error) {
    console.error('\n❌ Seeding failed:', error)
    process.exit(1)
  }
}

main().then(() => {
  process.exit(0)
}).catch((err) => {
  console.error('Unhandled error:', err)
  process.exit(1)
})
