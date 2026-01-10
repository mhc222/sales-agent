-- ============================================================================
-- RAG SEED: ICP & Persona Documents for JSB Media
-- Run after migrations to populate rag_documents table
-- ============================================================================

-- Get the JSB Media tenant ID
DO $$
DECLARE
  tenant_uuid UUID;
BEGIN
  SELECT id INTO tenant_uuid FROM tenants WHERE slug = 'jsb-media';

  -- ============================================================================
  -- ICP OVERVIEW
  -- ============================================================================
  INSERT INTO rag_documents (tenant_id, rag_type, content, metadata) VALUES
  (tenant_uuid, 'icp',
   'JSB Media Ideal Customer Profile (ICP) Overview:

Target Company Characteristics:
- Company Size: SMB to Mid-Market (typically 10-500 employees)
- Industries: QSR/Food Service, Automotive, E-commerce, Retail, Home Services, B2B SaaS, Multi-location Franchises
- Geography: United States
- Annual Revenue: $1M - $100M
- Marketing Spend: $10K+ monthly on paid media
- Tech Stack: Using Facebook Ads, Google Ads, or programmatic advertising

Key Qualifying Signals:
- High anonymous website traffic with low conversion
- Rising CPC/CPA costs on paid channels
- Poor Facebook match rates (below 50%)
- Heavy reliance on paid search with limited organic presence
- Multi-location businesses needing unified marketing
- Challenger brands competing against larger competitors with limited budgets',
   '{"category": "icp_overview", "priority": "high"}'::jsonb);

  -- ============================================================================
  -- PERSONA: OWNERS (ATL)
  -- ============================================================================
  INSERT INTO rag_documents (tenant_id, rag_type, content, metadata) VALUES
  (tenant_uuid, 'persona',
   'Persona: Business Owners (Above The Line Decision Maker)

Job Titles: Small Business Owner, SMB CEO, Founder, General Manager, Local Franchise Owner

What They Care About:
- Growing revenue and increasing lead flow
- Maximizing marketing ROI with limited resources
- Strengthening brand presence locally
- Reducing customer acquisition costs

Key KPIs They Track:
- Revenue growth
- Lead volume
- Foot traffic (for physical locations)
- Customer Acquisition Cost (CAC)
- Repeat customer rate

How They Spend Their Time:
- Overseeing every business function
- Managing cash flow
- Reviewing marketing performance
- Fixing local execution issues

Common Pain Points:
1. Unreliable marketing results - agencies overpromise and underdeliver
2. Lack of time and expertise to manage marketing properly
3. Weak creative and brand consistency across channels

Buying Behavior:
- Often involved directly in buying decisions
- Price-sensitive but ROI-focused
- Need proof of results before committing
- Prefer done-for-you solutions',
   '{"persona_type": "owner", "decision_level": "ATL", "priority": "high"}'::jsonb);

  -- ============================================================================
  -- PERSONA: MARKETING LEADERSHIP (ATL)
  -- ============================================================================
  INSERT INTO rag_documents (tenant_id, rag_type, content, metadata) VALUES
  (tenant_uuid, 'persona',
   'Persona: Marketing Leadership (Above The Line Decision Maker)

Job Titles: CMO, VP Marketing, Director of Marketing

What They Care About:
- Growing revenue through better media performance
- Creating unified growth strategy across channels
- Building stronger brand consistency
- Proving marketing''s impact on pipeline

Key KPIs They Track:
- ROAS (Return on Ad Spend)
- CAC (Customer Acquisition Cost)
- LTV (Lifetime Value)
- Brand equity metrics
- Pipeline influenced by marketing

How They Spend Their Time:
- Reviewing campaign performance
- Managing marketing budgets
- Planning quarterly/annual strategy
- Coordinating with sales leadership

Common Pain Points:
1. Poor attribution - can''t prove marketing ROI to leadership
2. Fragmented channels - no unified view of performance
3. Underperforming ad spend with diminishing returns

Buying Behavior:
- Strategic thinkers who need to justify spend to CEO/Board
- Value partners who understand full-funnel impact
- Looking for innovation and competitive advantage
- Typical decision timeline: 2-4 weeks',
   '{"persona_type": "marketing_leadership", "decision_level": "ATL", "priority": "high"}'::jsonb);

  -- ============================================================================
  -- PERSONA: GROWTH / PERFORMANCE MARKETING (ATL)
  -- ============================================================================
  INSERT INTO rag_documents (tenant_id, rag_type, content, metadata) VALUES
  (tenant_uuid, 'persona',
   'Persona: Growth / Performance Marketing (Above The Line Decision Maker)

Job Titles: VP Growth, Head of Performance Marketing, Growth Marketing Manager

What They Care About:
- Scaling paid channels profitably
- Reducing CAC while maintaining volume
- Accurate attribution across touchpoints
- Finding new acquisition channels before saturation

Key KPIs They Track:
- CAC (Customer Acquisition Cost)
- ROAS (Return on Ad Spend)
- MER (Marketing Efficiency Ratio)
- Conversion rate by channel
- Blended CPA

How They Spend Their Time:
- Optimizing acquisition funnels
- Running A/B tests and experiments
- Analyzing channel performance
- Evaluating new tools and platforms

Common Pain Points:
1. Channel fatigue - Facebook/Google costs rising, returns declining
2. Scaling bottlenecks - can''t increase spend without killing efficiency
3. Unclear ROI - hard to attribute conversions accurately

Buying Behavior:
- Data-driven, wants to see proof and case studies
- Comfortable with technical solutions
- Often runs pilots before full commitment
- Values speed of implementation',
   '{"persona_type": "growth_marketing", "decision_level": "ATL", "priority": "high"}'::jsonb);

  -- ============================================================================
  -- PERSONA: PAID MEDIA EXECUTION (BTL)
  -- ============================================================================
  INSERT INTO rag_documents (tenant_id, rag_type, content, metadata) VALUES
  (tenant_uuid, 'persona',
   'Persona: Paid Media & Campaign Execution (Below The Line - Influencer)

Job Titles: Paid Media Manager, PPC Lead, Programmatic Manager, Digital Marketing Manager

What They Care About:
- Achieving stable, scalable campaign performance
- Meeting monthly/quarterly targets
- Reducing manual workload
- Staying current with platform changes

Key KPIs They Track:
- CTR (Click-Through Rate)
- CPC (Cost Per Click)
- CPA (Cost Per Acquisition)
- ROAS (Return on Ad Spend)
- Quality Score

How They Spend Their Time:
- Managing daily campaign optimizations
- Adjusting budgets and bids
- Testing creative variations
- Building reports for leadership

Common Pain Points:
1. Time limitations - too many campaigns, not enough hours
2. Inconsistent performance - results vary wildly week to week
3. Channel complexity - constant platform updates and new features

Buying Behavior:
- Tactical focus, wants tools that save time
- May influence but rarely final decision maker
- Appreciates hands-on support and training
- Can be internal champion if impressed',
   '{"persona_type": "paid_media", "decision_level": "BTL", "priority": "medium"}'::jsonb);

  -- ============================================================================
  -- PERSONA: SALES LEADERSHIP (ATL)
  -- ============================================================================
  INSERT INTO rag_documents (tenant_id, rag_type, content, metadata) VALUES
  (tenant_uuid, 'persona',
   'Persona: Sales Leadership (Above The Line Decision Maker)

Job Titles: CRO, VP Sales, Head of Sales, Sales Director

What They Care About:
- Increasing qualified pipeline volume
- Improving lead-to-opportunity conversion
- Aligning marketing and sales on lead quality
- Predictable revenue growth

Key KPIs They Track:
- SQL (Sales Qualified Lead) volume
- Win rate
- Average deal size
- Sales cycle length
- Pipeline coverage

How They Spend Their Time:
- Meeting with marketing to align on lead quality
- Reviewing pipeline and forecasts
- Coaching sales team
- Strategic account planning

Common Pain Points:
1. Inconsistent pipeline - feast or famine lead flow
2. Poor lead quality - marketing sends unqualified leads
3. Misaligned messaging - prospects confused by marketing vs sales story

Buying Behavior:
- Cares about lead quality over quantity
- Wants marketing to be accountable to revenue
- May push for solutions that improve lead scoring
- Values case studies showing pipeline impact',
   '{"persona_type": "sales_leadership", "decision_level": "ATL", "priority": "medium"}'::jsonb);

  -- ============================================================================
  -- PERSONA: PROFESSIONAL SERVICES (ATL)
  -- ============================================================================
  INSERT INTO rag_documents (tenant_id, rag_type, content, metadata) VALUES
  (tenant_uuid, 'persona',
   'Persona: Professional Services Partners (Above The Line Decision Maker)

Job Titles: Partner, Principal, Managing Director, Practice Leader (at law firms, accounting firms, consultancies)

What They Care About:
- Originating new business (growing their book)
- Differentiating in a competitive market
- Building thought leadership and visibility
- Generating qualified leads for their practice

Key KPIs They Track:
- Origination credit / new client revenue
- Referral network strength
- Visibility metrics (speaking, publications, rankings)
- Client retention rate

How They Spend Their Time:
- Serving existing clients (billable work)
- Business development and networking
- Thought leadership (writing, speaking)
- Managing their practice team

Common Pain Points:
1. Referrals are inconsistent - feast or famine new business
2. Website gets traffic but no qualified consultation requests
3. Hard to stand out when competitors claim similar expertise
4. Limited time for business development while serving clients

Buying Behavior:
- Relationship-driven, values trust and reputation
- Cares about professional image and compliance
- Decision timeline: 2-6 weeks, often needs partner consensus

IMPORTANT: Relationship type must be determined from research, not assumed from vertical.
Professional services firms can be:
- Direct clients (their firm needs marketing to attract new clients)
- Referral partners (they advise clients who need marketing)
- White label (they want to offer marketing services to their clients)
Analyze their content and context to determine the right relationship type.',
   '{"persona_type": "professional_services", "decision_level": "ATL", "priority": "medium"}'::jsonb);

  -- ============================================================================
  -- JSB MEDIA VALUE PROPOSITIONS
  -- ============================================================================
  INSERT INTO rag_documents (tenant_id, rag_type, content, metadata) VALUES
  (tenant_uuid, 'shared',
   'JSB Media Core Value Propositions:

1. Identity Resolution Technology
   - Track and recover anonymous website visitors
   - Typical result: 10-25% traffic recovery
   - 40% CPA reduction through better targeting

2. Match Rate Optimization
   - Improve Facebook match rates from 25% to 95%
   - Reduce CPA by $90+ (e.g., $300 to $210)
   - Reach audiences competitors can''t target

3. Blue Ocean Retargeting
   - Access proprietary audience data
   - Target untapped segments competitors miss
   - 30% CPC reduction while scaling

4. B2B2C Identity Graph
   - Reach executives through consumer behavior data
   - 99% match rate on decision-makers
   - 2x conversion improvement on B2B campaigns

5. AI-Powered Organic Content
   - Generate SEO content at scale
   - Target low-competition keywords
   - 50K+ monthly organic visitors achievable
   - Reduce paid ad dependency

6. Guerrilla Digital Tactics
   - Multi-channel integration (social, mobile, geo-targeting)
   - Viral content strategies
   - 25%+ traffic increase, 40%+ sales lift typical results',
   '{"category": "value_propositions", "priority": "high"}'::jsonb);

  -- ============================================================================
  -- DISQUALIFICATION CRITERIA
  -- ============================================================================
  INSERT INTO rag_documents (tenant_id, rag_type, content, metadata) VALUES
  (tenant_uuid, 'shared',
   'JSB Media Disqualification Criteria:

Immediate Disqualifiers:
- Company size under 5 employees (too small)
- No existing paid media spend (not ready)
- Budget under $5K/month for marketing services
- Industries we don''t serve: gambling, adult content, weapons
- Competitors or agencies (conflict of interest)

Weak Fit Signals (May Still Qualify):
- B2B with very long sales cycles (6+ months)
- Highly regulated industries (healthcare, finance) - requires compliance review
- International-only companies (US focus)
- Pure SaaS with no paid acquisition strategy

Relationship Red Flags:
- Previous bad relationship with JSB Media
- Known difficult client from industry reputation
- Unrealistic expectations (want 10x results in 30 days)
- No clear decision maker identified

Seniority Requirements:
- ATL (Above The Line): Can make buying decisions - PRIORITIZE
- BTL (Below The Line): Influencers only - MAY NEED ESCALATION
- Minimum acceptable: Director level or business owner',
   '{"category": "disqualification", "priority": "high"}'::jsonb);

  -- ============================================================================
  -- CASE STUDY SIGNALS
  -- ============================================================================
  INSERT INTO rag_documents (tenant_id, rag_type, content, metadata) VALUES
  (tenant_uuid, 'shared',
   'JSB Media Proven Results by Industry:

QSR / Food Service:
- Client: Quiznos (multi-location chain)
- Challenge: Battling larger competitors, needed traffic
- Solution: Guerrilla digital strategy, mobile geo-targeting
- Results: 25%+ traffic increase, 40%+ location sales lift, $550K free media value

E-commerce / Retail:
- Client: Gerber (knife brand)
- Challenge: Challenger position, small budget
- Solution: TV show product placement, co-branded content
- Results: 100% sell-through in 2 days, 201% online sales increase, 280% site traffic boost

E-commerce (Identity Resolution):
- Challenge: High anonymous traffic, low conversion
- Solution: Identity resolution pixel tracking
- Results: $10K revenue from recovered traffic, 40% CPA reduction

Multi-Location Franchise:
- Client: Multi-location HVAC company
- Challenge: High Google Ads costs, limited budget
- Solution: AI-powered SEO content strategy
- Results: 50K+ monthly organic visitors, reduced paid ad dependency

B2B / High-CPC Advertisers:
- Challenge: Rising CPC costs, saturated targeting
- Solution: Blue ocean retargeting with proprietary data
- Results: 30% CPC decrease, maintained profitability while scaling',
   '{"category": "case_studies", "priority": "medium"}'::jsonb);

END $$;
