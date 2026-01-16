-- ============================================================================
-- RAG SEED: Fundamentals - Universal Sales Best Practices
-- These documents have NULL tenant_id (shared across all brands)
-- Source: outbound_os_brain.md - Lavender research-backed data
-- ============================================================================

-- ============================================================================
-- EMAIL BEST PRACTICES (fundamental_email)
-- ============================================================================

-- Writing Level & Simplicity
INSERT INTO rag_documents (tenant_id, rag_type, content, metadata) VALUES
(NULL, 'fundamental_email',
'Email Writing Level & Simplicity Best Practices (Lavender Research):

READING LEVEL:
- 70% of emails are written at or beyond a 10th-grade reading level
- Writing at a 3rd to 5th-grade reading level increases replies by 50%
- Use short simple words and choppy sentences
- Avoid commas and complex grammar
- Credibility comes from understanding the buyer, not from jargon

WORD COUNT:
- Average person takes 9 seconds to scan an email
- Keep emails under 75 words, aim for 25-50 words
- Using fewer words increases response chance by 68%

WHITE SPACE:
- Break email into multiple one-line sentences or short paragraphs (1-2 sentences)
- A single desktop line becomes 2-4 lines on mobile
- Mobile optimization is essential for getting replies

FORMALITY:
- Write how you would speak (then edit run-on sentences)
- Pretend you are writing to a friend you have not met yet
- Even CEOs are human - treat them like one',
'{"category": "writing_basics", "priority": "high", "source": "lavender_research"}'::jsonb);

-- Tonality Guidelines
INSERT INTO rag_documents (tenant_id, rag_type, content, metadata) VALUES
(NULL, 'fundamental_email',
'Email Tonality Best Practices (Lavender Research):

UNSURE TONES OUTPERFORM CONFIDENT ASSERTIONS:
- Most think tentative tones are bad for sellers
- Turns out uncertainty works in cold emails
- Buyers want to be understood AND heard
- When you talk AT prospects about their problems, they tune out

WHAT MAKES AN UNSURE TONE:
- Ask questions
- Use language that implies questions: "Let me know if you would like more information"
- Use hedge words: "typically", "might", "looks like", "could be"
- Use passive language and conditionals

WHY UNSURE TONES WORK:
- Avoids triggering mental spam filter
- Does not come across as "sales-y"
- Invites reader to correct or engage
- Positions you as curious, not prescriptive

EXAMPLE COMPARISON:
BAD (Educational): "I saw you are hiring. According to {blog}, X% of new sales hires don''t hit quota."
BAD (Neutral): "I saw you are hiring. You must be starting to think about ramp."
GOOD (Unsure): "Looks like you are hiring. Typically, this means sales leaders are starting to think about ramp."

HEDGE WORDS TO USE:
- "typically" / "usually"
- "might" / "could"
- "looks like" / "seems like"
- "I could be wrong, but..."
- "are starting to"',
'{"category": "tonality", "priority": "high", "source": "lavender_research"}'::jsonb);

-- Cliches to Avoid
INSERT INTO rag_documents (tenant_id, rag_type, content, metadata) VALUES
(NULL, 'fundamental_email',
'Email Phrases to NEVER Use (Cliches That Kill Engagement):

IMMEDIATE TURN-OFFS:
- "Hope this finds you well"
- "I wanted to reach out because..."
- "We help companies like yours..."
- "I would love to pick your brain"
- "Do you have 15 minutes?"
- "I am sure you are busy"
- "Sorry for the persistence"
- "Sorry to reach out again"
- "Just wanted to check in"
- "Just reminding you about my last email"
- "Thoughts?"
- "Any feedback?"

WHY THESE FAIL:
- Buyers immediately filter cliche messages as spam
- They are overused and waste valuable space
- They trigger the mental spam filter
- They make you sound like every other salesperson

BUMP EMAIL ANTI-PATTERNS:
- Apologizing: Makes you seem like nagging ex-partner
- Lazy one-liners: Puts friction on the reader
- Repetitive bumps: "Just reminding you" adds no value
- Overly aggressive: "What is the holdup?" - too assertive',
'{"category": "anti_patterns", "priority": "high", "source": "lavender_research"}'::jsonb);

-- Subject Line Best Practices
INSERT INTO rag_documents (tenant_id, rag_type, content, metadata) VALUES
(NULL, 'fundamental_email',
'Email Subject Line Best Practices (Lavender Research):

OPTIMAL SUBJECT LINE:
- 2-3 words maximum (2 is optimal)
- Going from 2 to 4 words reduces replies by 17.5%
- Use title case (not using it reduces opens by 30%)
- Neutral tone - make it sound like an internal email
- Describe what the email is about

WHAT TO AVOID:
- Questions: Lower open rate by 56%
- Numbers: Reduce open chance by 46.33%
- Punctuation (? or !): Reduces opens by 36%
- Commands: "improve", "respond", "reply"
- Superlatives: "better", "improved", "accelerated"
- First names: Receive 12% fewer replies (Salesloft data)
- Cliches: "15 minutes?", "Thoughts?", "Quick Question"

GOOD EXAMPLES:
- "Ramp Time"
- "Email Writing"
- "Response Rates"
- "FX Rates"
- "Data Thoughts"

BAD EXAMPLES:
- "Struggling to get qualified leads John?"
- "10x your revenue"
- "I will get you 100 leads for free!"
- "Sam, anytime for a call?"
- "Accelerate your reps ramp time"

PREVIEW TEXT:
- Short subject lines maximize preview text shown
- First two sentences are critical - they become the preview
- Show the message is written FOR them and relevant
- Avoid cliches - pique interest and show value immediately',
'{"category": "subject_lines", "priority": "high", "source": "lavender_research"}'::jsonb);

-- CTA Best Practices
INSERT INTO rag_documents (tenant_id, rag_type, content, metadata) VALUES
(NULL, 'fundamental_email',
'Email CTA (Call to Action) Best Practices:

THE GOAL:
- Start a conversation, NOT close a deal
- Sales is a one-to-one conversation
- One clear ask per email
- Keep it open-ended to increase response likelihood

DIRECT CTAs (AVOID):
- Your time has no value to a stranger
- Unless you are a celebrity, "Do you have 15 minutes?" fails
- Only works if you have market monopoly

INTEREST-BASED CTAs (BEST):
- Softest approach with focus on curiosity and timing
- Super low friction ask
- Examples:
  * "Worth a peek?"
  * "Open to hearing more?"
  * "Open to learning how?"
  * "Is it worth exploring X?"
  * "Is Z a focus for the team?"

MUDDYING THE ASK (Advanced):
- Mix informative tone with uncertainty
- BAD: "Worth a chat about how we can improve your reply rates?"
- GOOD: "Worth a chat?"

VALUE-BASED CTAs (EXCELLENT):
- Offer something so valuable they would be foolish not to reply
- Related to their ICP and challenges
- Give without asking for anything in return
- Example: "We made a sequence getting 10+ meetings a month - mind if I share?"',
'{"category": "ctas", "priority": "high", "source": "lavender_research"}'::jsonb);

-- F-Shaped Reading Pattern
INSERT INTO rag_documents (tenant_id, rag_type, content, metadata) VALUES
(NULL, 'fundamental_email',
'F-Shaped Reading Pattern for Email Layout:

WHAT IT IS:
- Most common eye-scanning pattern for content blocks
- Identified by Nielsen Norman Group with 200,000+ participants
- People do NOT read left to right - they scan in F pattern

WHY IT MATTERS:
- Attention spans are lower than ever
- People scan - if nothing interests them, they leave
- Knowing the pattern lets you place CTAs in hotspots

HOW TO USE IT IN EMAILS:
1. Place most important content in the F-pattern hotspots
2. Make emails super concise and readable
3. Design for scanning - no large blocks of text
4. Use white space strategically
5. Front-load key information in first two lines',
'{"category": "layout", "priority": "medium", "source": "nielsen_norman_group"}'::jsonb);

-- ============================================================================
-- T.I.P.S FRAMEWORK (fundamental_framework)
-- ============================================================================

INSERT INTO rag_documents (tenant_id, rag_type, content, metadata) VALUES
(NULL, 'fundamental_framework',
'T.I.P.S Email Framework - Complete Guide:

FRAMEWORK OVERVIEW:
T - Trigger
I - Implication
P - Problem
S - Social Proof / Solution

================================================================================
TRIGGER
================================================================================
Have a relevant trigger explaining WHY you are reaching out.
Examples: new job change, team expansion, actively hiring, funding round
Make it clear in the first line why it makes sense for them to talk with you.

================================================================================
IMPLICATION
================================================================================
Imply what you THINK is a priority based on the trigger.
Example: If they hired 5 new reps, ramping them would likely be a priority.
This shows it is not generic spray and pray.

================================================================================
PROBLEM
================================================================================
Identify a common pain point faced by your ICP relating to the implication.
Dig into the pain and why it should be a priority to fix.
People love to stay the same - show them the negative outcome of NOT changing.

Use the BAB Framework (Before After Bridge):
- BEFORE: Where they are now
- AFTER: The desired outcome they should want
- BRIDGE: How you helped someone get there

================================================================================
SOCIAL PROOF
================================================================================
Using social proof builds credibility in your outreach.
If you have names to drop, DO IT!
Add a desired outcome they achieved from working with you.

================================================================================
SOLUTION
================================================================================
Explain how your solution got the desired outcome from social proof.
Keep it brief - the goal is to get a response, not sell on the email.
Do not go into depth - that is what a call is for after they respond.

================================================================================
SOFT CTA
================================================================================
Finish with a soft CTA. Goal is to get a reply.
- "Worth a chat?"
- "Open to hearing more?"
Bonus points if you use a lead magnet with a soft CTA.',
'{"category": "tips_framework", "priority": "high", "source": "outbound_os"}'::jsonb);

-- T.I.P.S Email Structure & Example
INSERT INTO rag_documents (tenant_id, rag_type, content, metadata) VALUES
(NULL, 'fundamental_framework',
'T.I.P.S Email Structure & Example:

STRUCTURE:
Hey [name]

Looks like [relevant trigger], Imagine you are / thought you would [implication based on trigger]

Usually, our customers struggle [main problem related to ICP]

So [dig into the pain]

We have been helping [social proof]

[positive outcome & how your solution did that]

[Soft CTA]

================================================================================
EXAMPLE EMAIL
================================================================================
Subj: Ramp Time

Hey Sam

Looks like you are hiring AEs in DC, imagine ramping them quickly is a priority.

Most sales leaders struggle to get reps ramped under 5 months.

The delays caused 65% of sales teams to miss quota in 2023.

We helped Gong''s reps ramp <3 months with our coaching.

Open to seeing how?

================================================================================
WHY THIS WORKS
================================================================================
First part explains why you are reaching out.
Making an informed conclusion from observation shows you understand their situation.
This builds credibility.

Second half backs up your ability to speak to that challenge.
You have helped others - sharing this gives concrete understanding of what you bring.',
'{"category": "tips_framework", "priority": "high", "source": "outbound_os"}'::jsonb);

-- T.I.P.S with Lead Magnet
INSERT INTO rag_documents (tenant_id, rag_type, content, metadata) VALUES
(NULL, 'fundamental_framework',
'T.I.P.S Lead Magnet Email Variant:

STRUCTURE:
- Trigger
- Implication
- Problem
- Social proof
- Solution
- Lead magnet

================================================================================
EXAMPLE EMAIL 1
================================================================================
Hi Sam

Looks like you are managing the outbound team at Apple, imagine reps messaging is top of mind.

Typically companies have a great solution but struggle to convey it to their ICP.

Meaning they get on average 1% positive reply rates.

We helped Gong achieve a 5% positive reply rate with our coaching.

We made a list of the emails that got the most replies - mind if I share?

Thanks

================================================================================
EXAMPLE EMAIL 2
================================================================================
Hey Sam

Noticed you are hiring 3 new SDRs curious if their outbound messaging is a focus.

Cold emails typically get a 30% open rate and a 3% reply rate.

Gong hit 60% open rates and 15% reply rates with this template we made - can I share them?

================================================================================
WHY IT WORKS
================================================================================
Concise and relevant copy. Called out reason for reaching out.
Broke down likely priority and issue faced.
Showed how you helped similar business achieve desired result.
THEN a PURE value-based CTA offering a resource that will help.',
'{"category": "tips_framework", "priority": "high", "source": "outbound_os"}'::jsonb);

-- ============================================================================
-- INTENT SIGNALS (fundamental_intent)
-- ============================================================================

INSERT INTO rag_documents (tenant_id, rag_type, content, metadata) VALUES
(NULL, 'fundamental_intent',
'Intent Signals Definition - 22 Signals to Watch:

WHAT ARE INTENT SIGNALS?
Indicators that a prospect is showing interest or readiness to engage in buying process.
Using intent signals allows you to better prioritize outreach and time.
Data from Hubspot: personalization can increase reply rate by 142%.

================================================================================
22 INTENT SIGNALS
================================================================================

1. JOB CHANGES
When someone starts a new role, they are brought in to make positive impact - includes changes.
Example opener: "Saw you joined [company] as [title] a few months ago"

2. KEY CONTACTS LEAVE ACCOUNT
When key persona leaves, bigger changes may be happening.
Engage remaining team to see if goals have shifted.

3. NOT HAPPY WITH CURRENT SOLUTION
If prospect publicly says they are unhappy with provider - USE THIS.
Monitor news articles and interviews.

4. EMPLOYEE GROWTH
Company headcount growing (LinkedIn SalesNav tracks this).
As they grow, different solutions may make sense for new size.

5. DOWNLOADED RESOURCE / REQUESTED DEMO BEFORE
GOLD MINE. Clear intent they are looking for solution to their pain.

6. TECHNOLOGY USAGE
Tech stack reveals current processes and gaps.
Identify opportunities for complementary products/services.

7. EVENT ANNOUNCEMENTS
If attending conference, likely open to discovering new products/trends.

8. PROFILE VIEWS / LIKES / COMMENTS
LinkedIn engagement shows familiarity with you.

9. FUNDRAISING
Bigger budget and expectations after funding.
Open to solutions to meet new targets.
Example: "Saw your recent Series B funding round (huge congrats!)"

10. OPEN JOB ROLES
Shows which areas are important. Positive sign in general.
BAD: "Saw you have open roles at company"
GOOD: "Saw you have 2 SDR openings in the EMEA region"

11. LAYOFFS
Likely struggling in at least one area.
Introduce solution to reduce further layoffs.

12. LINKEDIN CONTENT
Shows trying to grow and drive engagement.
Monitor for relevant messaging angles.

13. MAJOR CUSTOMER ACQUISITION
More eyes on them after securing major account.
Leverage to discuss utilization.

14. INTERNAL MOVEMENT
People moving to new management roles or team lead.
Likely willing to listen to new ideas.

15. COMPANY FOLLOWERS
Following your company = familiar with your solution.

16. ACQUISITIONS
M&A offers opportunities - two companies joining have new issues.

17. PREVIOUS CUSTOMER
If they moved companies in same industry, great opportunity.
You already helped them solve an issue before.

18. NEW OFFICES / EXPANDING
New locations or expansion means new requirements.

19. UPDATED WEBSITE
Shows improving online image, priorities may have changed.

20. ONLINE PRESENCE
When seeking solutions, they engage online leaving digital trail.
See if actively looking and which solutions they are considering.

21. PRESS COVERAGE
Company or person highlighted in press.
Use whatever was mentioned as trigger.

22. CLOSED LOST
Circle back - maybe timing was not right before.',
'{"category": "intent_signals", "priority": "high", "source": "outbound_os"}'::jsonb);

-- ============================================================================
-- ACCOUNT PRIORITIZATION (fundamental_framework)
-- ============================================================================

INSERT INTO rag_documents (tenant_id, rag_type, content, metadata) VALUES
(NULL, 'fundamental_framework',
'Account Prioritization Framework - The 80/20 Rule:

CORE PRINCIPLE:
80% of your revenue will come from 20% of your accounts.
Get laser-focused on your best accounts instead of wishing for more.
It is not about getting more accounts - it is about making best use of what you have.

================================================================================
TWO FACTORS FOR PRIORITIZATION
================================================================================

ICP (Ideal Customer Profile):
Description of the perfect company you want to target.
Make your best guess if exact fit is unclear.

CTC (Chance to Convert):
How likely is this business to turn from lead to SQL/meeting?
Someone who has engaged before (downloaded resource, requested demo) is more receptive.

================================================================================
PRIORITY TIERS
================================================================================

PERFECT FIT:
- Perfect ICP + Easy CTC
- 1-2% of your total accounts
- Most personalized touches

PRIORITY 1 (P1):
- Strong ICP and strong CTC
- 5% of your total accounts
- Highly personalized touches

PRIORITY 2 (P2):
- Great ICP and okay CTC OR okay ICP and great CTC
- 15% of your total accounts
- Generalized intent signals work

PRIORITY 3 (P3):
- Either poor ICP and/or poor CTC
- 80% of your total accounts
- Rely more on automation

================================================================================
OUTREACH CALIBRATION
================================================================================

Perfect Fit & P1: Most personalized touches, specific info intent signals
P2: Generalized intent signals (companies hiring, just raised funding, etc.)
P3: More automation, slightly more generalized messaging',
'{"category": "prioritization", "priority": "high", "source": "outbound_os"}'::jsonb);

-- ============================================================================
-- BUMP EMAIL STRATEGIES (fundamental_sequence)
-- ============================================================================

INSERT INTO rag_documents (tenant_id, rag_type, content, metadata) VALUES
(NULL, 'fundamental_sequence',
'Bump Email Strategy - Follow-Up Best Practices:

WHY FOLLOW UP:
- People may miss your initial email
- They may be busy or it got lost in other emails
- Average takes 3-4 touches to get a reply
- Fortune is in the follow-up

================================================================================
WHAT MAKES A BAD BUMP
================================================================================

APOLOGIZING:
"Sorry for the persistence..." / "Sorry to reach out again..."
You come off as creepy nagging ex-partner.
Instant mental spam filter trigger.

LAZY ONE-LINER:
"Any feedback" / "thoughts"
Puts ton of friction on reader to go read and give detailed reply.
Adds no relevancy.

REPETITIVE BUMP:
"Just wanted to check in" / "Just reminding you about my last email"
Adds no value to their day.
Comes across too salesy and desperate.

OVERLY AGGRESSIVE:
"What is the holdup?" / "This is a great opportunity you don''t want to miss"
Nobody wants orders barked at them from strangers.
Way too assertive.

================================================================================
THOUGHTFUL BUMP FRAMEWORK
================================================================================

STRUCTURE:
- Given X is a focus
- Thought this could be useful
- Any thoughts on my last message?

EXAMPLE:
"Given you are looking to improve the team''s outbound replies, thought this would be useful.
Any thoughts on my last message?"

OR:
"Given you are looking to improve the team''s outbound replies, thought this would be useful.
Or am I completely off the mark?"

WHY IT WORKS:
- Taps into reader''s sense of urgency
- Verifies your message deserves urgency by referencing context
- No one wants to miss an important email',
'{"category": "bump_strategy", "priority": "high", "source": "outbound_os"}'::jsonb);

-- Bump Email Frameworks
INSERT INTO rag_documents (tenant_id, rag_type, content, metadata) VALUES
(NULL, 'fundamental_sequence',
'Bump Email Frameworks - Specific Templates:

================================================================================
3RD PARTY RESOURCE BUMP
================================================================================
Structure:
- Bring up name of resource
- Reuse insight from before
- Explain what it is and the value
- Nod back to original CTA

Example:
"Hey James, do you read Outreach''s blog?

Assuming you are ramping those new reps, I thought you''d find it interesting.

The VP of Sales Dev at Segment wrote about how she scaled her team to a $3.2B acquisition.

They did it without using canned templates.

Any thoughts on my last note?"

Why it works: Third-party content is seen as neutral, building trust.

================================================================================
CASE STUDY BUMP
================================================================================
Structure:
- Context + bump
- Case study with link

Example:
"Hey John

Given ramp speed was a priority for you, thought this would be worth discussing.

Here is a quick breakdown on how we helped Gong half their ramp time.

Worth a chat?

[Link to case study]"

================================================================================
FOCUS BUMP
================================================================================
Structure:
- Trigger
- Focus
- CTA

Example:
"Hey Emmett

You have recently opened an office in Poland.

Usually that means there is a focus on scaling the client base outside the US.

Is that the case for you?"

================================================================================
ONE SENTENCE BUMP
================================================================================
Structure: One sentence referencing if issue is still a priority

Examples:
- "Is XYZ still a priority?"
- "Is [challenge] still a priority?"
- "Are you still working on <initiative>?"
- "Last we spoke [X problem] was a focus. Is that still top of mind?"

================================================================================
LABELING BUMP
================================================================================
Structure: Label why they have not responded

Examples:
- "It seems like my timing is off."
- "Looks like I am off with my assumption."
- "It feels like you are happy with what you have."

Why it works: People love to tell you when you are wrong.',
'{"category": "bump_strategy", "priority": "high", "source": "outbound_os"}'::jsonb);

-- ============================================================================
-- MULTI-CHANNEL SEQUENCE STRATEGY (fundamental_sequence)
-- ============================================================================

INSERT INTO rag_documents (tenant_id, rag_type, content, metadata) VALUES
(NULL, 'fundamental_sequence',
'Multi-Channel Sequence Strategy (OOS Sequence):

WHY MULTI-CHANNEL:
- Not everyone picks up phone to strangers
- Some never check their inbox
- Others are not active on LinkedIn
- Meet prospects on their preferred platform
- Key to increasing replies as a whole

================================================================================
TOP TIPS
================================================================================
- 97% of people are NOT in market to buy now - reach out to enough people
- You will be forgotten - re-sequence after 30 days with different reason
- All touchpoints should interlink to same key focus
- 15+ multi-channel steps - more reaching out the better (with value)
- Focus on starting conversation, not booking meeting right away
- Use multi-touchpoint days - gives chance to respond on preferred channel
- Never leave tasks unfinished - piles up and overwhelms

================================================================================
EMAIL BUCKETS
================================================================================
1. Initial Emails - T.I.P.S structure
2. Value Adds - Giving something to help prospect
3. Bump Emails - Context for why you are reaching out
4. Final Email - Last email asking for referral

================================================================================
OOS SEQUENCE TIMELINE (21 Days)
================================================================================
Day 1: Email 1 (T.I.P.S), LinkedIn connection, Call
Day 3: Email 2 (3rd Party Resource), LinkedIn Message, Call
Day 5: Email 3 (Thoughtful bump)
Day 6: Call
Day 7: LinkedIn Message
Day 8: Call
Day 12: Email 4 (New Thread - T.I.P.S), Call
Day 15: Email 5 (Case study), Call
Day 18: Email 6 (Focus Bump)
Day 19: Call
Day 21: Email 7 (Referral)

================================================================================
WHY THIS WORKS
================================================================================
- Mix of automated and manual steps - relevant + personalized
- Multiple touchpoints throughout sequence - reaching out to stand out
- Multi-touchpoint days - increases visibility',
'{"category": "sequence_strategy", "priority": "high", "source": "outbound_os"}'::jsonb);

-- ============================================================================
-- LAVENDER KEY STATISTICS (fundamental_email)
-- ============================================================================

INSERT INTO rag_documents (tenant_id, rag_type, content, metadata) VALUES
(NULL, 'fundamental_email',
'Key Statistics from Lavender Research (Data-Backed Insights):

READING LEVEL:
- 70% of emails written at or beyond 10th-grade reading level
- 3rd-5th grade level increases replies by 50%

WORD COUNT:
- Average person takes 9 seconds to scan email
- Fewer words increases response chance by 68%
- Optimal: 25-50 words, max 75 words

SUBJECT LINES:
- 2 words to 4 words: reduces replies by 17.5%
- Questions: lower open rate by 56%
- Numbers: reduce opens by 46.33%
- Punctuation: reduces opens by 36%
- Not using title case: reduces opens by 30%
- First names in subject: 12% fewer replies (Salesloft)

PERSONALIZATION:
- Personalization increases reply rate by 142% (HubSpot)

FOLLOW-UP:
- Average takes 3-4 touches to get a reply

GENERAL:
- 97% of people are NOT in market to buy now
- Mobile view: 1 desktop line = 2-4 mobile lines',
'{"category": "statistics", "priority": "medium", "source": "lavender_research"}'::jsonb);
