-- ============================================================================
-- RAG SEED: AI Prompt Templates
-- These documents have NULL tenant_id (shared across all brands)
-- Source: outbound_os_brain.md - Buyer Persona Matrix & Email Prompts
-- ============================================================================

-- ============================================================================
-- PERSONA RESEARCH PROMPTS (prompt_research)
-- ============================================================================

-- Buyer Persona Matrix - Website Outcome Analysis
INSERT INTO rag_documents (tenant_id, rag_type, content, metadata) VALUES
(NULL, 'prompt_research',
'Buyer Persona Matrix Prompt 1 - Website Outcome Analysis:

PURPOSE:
Analyze a company website to understand their core offerings and identify target departments.

PROMPT:
Go onto this website: {insert company website URL} and tell me the 5 main outcomes they provide for their customers in detail.

What departments within companies should I target for my sales outreach?

USAGE NOTES:
- The more information you give AI, the better it performs
- Do not just say "We help companies book more meetings"
- Instead explain in depth: "We help companies create highly relevant personalized emails by reviewing the prospect''s LinkedIn, this in turn helps with increasing positive replies and booking more meetings"

OUTPUT EXPECTED:
- 5 detailed outcomes the company provides
- List of target departments for outreach',
'{"category": "persona_research", "prompt_number": 1, "priority": "high"}'::jsonb);

-- Buyer Persona Matrix - Department Targeting
INSERT INTO rag_documents (tenant_id, rag_type, content, metadata) VALUES
(NULL, 'prompt_research',
'Buyer Persona Matrix Prompt 2 - Department Targeting:

PURPOSE:
Identify which departments to target based on the outcomes analysis.

PROMPT:
Based on that what departments within companies should I target for my sales outreach?

USAGE NOTES:
- Run after Prompt 1 to get refined targeting
- Consider decision-making hierarchy (who gets brought in at what stage)
- Finance Manager first, then Director of Finance, then CEO for final decision

OUTPUT EXPECTED:
- Prioritized list of departments
- Rationale for targeting each',
'{"category": "persona_research", "prompt_number": 2, "priority": "high"}'::jsonb);

-- Buyer Persona Matrix - Full Matrix Generation
INSERT INTO rag_documents (tenant_id, rag_type, content, metadata) VALUES
(NULL, 'prompt_research',
'Buyer Persona Matrix Prompt 3 - Full Matrix Generation:

PURPOSE:
Generate comprehensive buyer persona matrix with pains, KPIs, and solution mapping.

PROMPT:
For each of those departments, please summarize below points. Return the data in tabular format, with the below points as column headers. Each department will have its own row. Here are the points to summarize:

- What individuals in each department care about as it relates to business outcome
- KPIs, which are the specific KPIs for the job role, the department and day to day. Do deep research to ensure these KPIs are accurate.
- How individuals in each department spend their time to achieve business outcomes, what they do in the day to day.
- 3 common issues individuals in each department often struggle with to achieve those business outcomes
- The impact / Cost of inaction this has on the person / KPIs / company specifically
- How the solution I sell may be able to help individuals in each department hit their KPI goals and avoid the issues & impact

USAGE NOTES:
- Run after Prompts 1 and 2
- Use as starting point then build on with real customer feedback
- Add specific examples from closed deals
- Talk to sales team about common problems and solutions

OUTPUT EXPECTED:
Tabular matrix with columns:
| Department | What They Care About | KPIs | How They Spend Time | 3 Common Issues | Cost of Inaction | How Solution Helps |',
'{"category": "persona_research", "prompt_number": 3, "priority": "high"}'::jsonb);

-- ============================================================================
-- EMAIL GENERATION PROMPTS (prompt_email)
-- ============================================================================

-- Initial Email Prompt (T.I.P.S Framework)
INSERT INTO rag_documents (tenant_id, rag_type, content, metadata) VALUES
(NULL, 'prompt_email',
'Initial Cold Email Prompt - T.I.P.S Framework:

PURPOSE:
Generate initial cold email following the T.I.P.S framework.

PROMPT:
Create a cold email following the TIPS Framework (below). You are a BDR sending an email to {title} who {trigger}

Their pain is: {add in the pain}

The implication of the pain: {what it leads to for that persona}

How we help solve that pain: {your solution and what it leads to}

Find some statistics online that relate to the pain and the implication of the pain. Come up with 5 drafts of an email. Keep each draft below 75 words.

Keep it to under a 6th grade reading level.

Make the subject line 2 words and related to the topic.

For example if it is to a head of sales talking about the reps ramp time, use a subject line like "Ramp Time"

Don''t use any adjectives, or any punctuation in the subject line.

TIPS FRAMEWORK REFERENCE:
T - Trigger: Relevant trigger explaining why reaching out
I - Implication: What you think is a priority based on trigger
P - Problem: Common pain point related to the implication
S - Social Proof/Solution: How you helped others achieve desired outcome

CONSTRAINTS:
- Under 75 words per draft
- 6th grade reading level
- 2 word subject line
- No adjectives in subject
- No punctuation in subject
- 5 different drafts',
'{"category": "initial_email", "framework": "tips", "priority": "high"}'::jsonb);

-- Bump Email Prompt
INSERT INTO rag_documents (tenant_id, rag_type, content, metadata) VALUES
(NULL, 'prompt_email',
'Bump Email Prompt - Follow-Up Generation:

PURPOSE:
Generate follow-up/bump emails using various frameworks.

PROMPT:
Create 5 follow-up emails using email frameworks below. You are a BDR sending an email to {title} who {trigger}

Their pain is: {add in the pain}

The implication of the pain: {what it leads to for that persona}

How we help solve that pain: {your solution and what it leads to}

Find some statistics online that relate to the pain and the implication of the pain. Come up with 5 drafts of an email. Keep each draft below 75 words.

Keep it to under a 6th grade reading level.

Make the subject line 2 words and related to the topic.

For example if it is to a head of sales talking about the reps ramp time, use a subject line like "Ramp Time"

Don''t use any adjectives, or any punctuation in the subject line.

BUMP FRAMEWORKS TO USE:
1. 3rd Party Resource Bump - Share relevant external content
2. Thoughtful Bump - Reference context + ask for feedback
3. Case Study Bump - Share relevant success story
4. Focus Bump - Trigger + assumed focus + question
5. One Sentence Bump - Is [challenge] still a priority?

CONSTRAINTS:
- Under 75 words per draft
- 6th grade reading level
- 2 word subject line
- No adjectives in subject
- No punctuation in subject
- 5 different drafts using different frameworks',
'{"category": "bump_email", "priority": "high"}'::jsonb);

-- ============================================================================
-- LINKEDIN POST TEMPLATES (prompt_content)
-- ============================================================================

INSERT INTO rag_documents (tenant_id, rag_type, content, metadata) VALUES
(NULL, 'prompt_content',
'LinkedIn Post Templates - 30 Frameworks (Part 1 of 3):

================================================================================
1. SIMPLIFY
================================================================================
People overcomplicate [thing]

Listen, if you are a {experience level}:

Avoid:
[bullet 1]
[bullet 2]
[bullet 3]

Instead:
[bullet 1]
[bullet 2]
[bullet 3]

================================================================================
2. CONTRARIAN
================================================================================
Unpopular opinion: [hot take]

Here is why:

[reason 1]
[reason 2]
[reason 3]

================================================================================
3. THE LISTICLE
================================================================================
[Number] [things] every [persona] should know:

1. [item]
2. [item]
3. [item]
...

================================================================================
4. STORY
================================================================================
[Year], I was [situation]

[What happened]

[Lesson learned]

This taught me: [insight]

================================================================================
5. MYTH BUSTER
================================================================================
Myth: [common belief]

Reality: [the truth]

Here is why people get it wrong:
[explanation]

================================================================================
6. BEFORE/AFTER
================================================================================
Before [event/learning]:
[old state]

After:
[new state]

What changed? [explanation]

================================================================================
7. HOW I DID X
================================================================================
How I [achieved result]:

Step 1: [action]
Step 2: [action]
Step 3: [action]

Result: [outcome]

================================================================================
8. COMPARISON
================================================================================
[Thing A] vs [Thing B]

[Thing A]:
- [pro/con]
- [pro/con]

[Thing B]:
- [pro/con]
- [pro/con]

My take: [opinion]

================================================================================
9. THE QUESTION
================================================================================
Quick question for [persona]:

[Thought-provoking question]?

Here is why I ask: [context]

Drop your answer below.

================================================================================
10. DATA POINT
================================================================================
[Surprising statistic]

What this means for [persona]:

[Insight 1]
[Insight 2]
[Insight 3]',
'{"category": "linkedin_templates", "template_set": 1, "priority": "medium"}'::jsonb);

INSERT INTO rag_documents (tenant_id, rag_type, content, metadata) VALUES
(NULL, 'prompt_content',
'LinkedIn Post Templates - 30 Frameworks (Part 2 of 3):

================================================================================
11. THE FRAMEWORK
================================================================================
My framework for [achieving outcome]:

[Acronym] Framework:
[Letter] - [meaning]
[Letter] - [meaning]
[Letter] - [meaning]

Here is how to apply it: [explanation]

================================================================================
12. LESSONS FROM
================================================================================
[Number] lessons from [experience/person/book]:

1. [lesson]
2. [lesson]
3. [lesson]

The one that changed everything: [highlight]

================================================================================
13. MISTAKES I MADE
================================================================================
[Number] mistakes I made as a [role]:

Mistake 1: [what I did wrong]
What I should have done: [correct approach]

[Repeat pattern]

================================================================================
14. WHAT I WISH I KNEW
================================================================================
What I wish I knew about [topic] [time] ago:

1. [insight]
2. [insight]
3. [insight]

Would have saved me [time/money/pain].

================================================================================
15. THE CHALLENGE
================================================================================
Challenge for [persona] this week:

[Specific action]

Why? [Reasoning]

Comment "IN" if you are doing it.

================================================================================
16. QUOTE + TAKE
================================================================================
"[Memorable quote]" - [Person]

Here is why this matters for [persona]:

[Your take/expansion]

================================================================================
17. DAY IN THE LIFE
================================================================================
My [day/week] as a [role]:

[Time]: [Activity]
[Time]: [Activity]
[Time]: [Activity]

Biggest surprise: [insight]

================================================================================
18. RESOURCE SHARE
================================================================================
[Number] [resources] that changed how I [do thing]:

1. [Resource name] - [why it helps]
2. [Resource name] - [why it helps]
3. [Resource name] - [why it helps]

Save this post for later.

================================================================================
19. PREDICTION
================================================================================
My prediction for [industry/topic] in [timeframe]:

[Prediction 1]
[Prediction 2]
[Prediction 3]

Here is why: [reasoning]

================================================================================
20. THE RANT
================================================================================
Can we talk about [frustrating thing]?

[Explain the problem]

[Why it matters]

[What should change]

Am I the only one?',
'{"category": "linkedin_templates", "template_set": 2, "priority": "medium"}'::jsonb);

INSERT INTO rag_documents (tenant_id, rag_type, content, metadata) VALUES
(NULL, 'prompt_content',
'LinkedIn Post Templates - 30 Frameworks (Part 3 of 3):

================================================================================
21. TOOL/STACK REVEAL
================================================================================
My [tool/tech] stack for [outcome]:

[Tool 1]: [what I use it for]
[Tool 2]: [what I use it for]
[Tool 3]: [what I use it for]

Total investment: [cost/time]
ROI: [result]

================================================================================
22. WIN/LOSS ANALYSIS
================================================================================
Just [won/lost] [deal/opportunity].

Here is what happened:

[Context]

[What worked/didn''t work]

Lesson: [takeaway]

================================================================================
23. COUNTERINTUITIVE
================================================================================
The counterintuitive truth about [topic]:

[Common approach] often leads to [bad outcome].

Instead, try [different approach].

Here is why it works: [explanation]

================================================================================
24. THE THREAD
================================================================================
[Topic] explained in [number] parts:

Part 1: [Concept]
[Explanation]

Part 2: [Concept]
[Explanation]

[Continue pattern]

================================================================================
25. REFLECTION
================================================================================
[Time period] ago I [did something].

[What I thought would happen]

[What actually happened]

[What I learned]

================================================================================
26. THE GIVE
================================================================================
Giving away [valuable thing] for free.

Here is what you get:
[Item 1]
[Item 2]
[Item 3]

Comment "[word]" and I will send it.

================================================================================
27. CELEBRATION
================================================================================
[Achievement]

Not posting this to brag.

Posting because: [real reason/lesson]

[What made it possible]

================================================================================
28. THE POLL
================================================================================
Quick poll for [persona]:

[Question]?

A) [Option]
B) [Option]
C) [Option]

Results + my take coming [when].

================================================================================
29. HOOK COLLECTION
================================================================================
[Number] [item] hooks that work:

[Hook 1]
[Hook 2]
[Hook 3]
[Hook 4]
[Hook 5]

Use them, don''t abuse them.

================================================================================
30. THE CONFESSION
================================================================================
Confession: [honest admission]

[Context/story]

[What I learned]

[Call to share similar experiences]',
'{"category": "linkedin_templates", "template_set": 3, "priority": "medium"}'::jsonb);

-- ============================================================================
-- HOOK TEMPLATES FOR CONTENT (prompt_content)
-- ============================================================================

INSERT INTO rag_documents (tenant_id, rag_type, content, metadata) VALUES
(NULL, 'prompt_content',
'Content Hook Templates - Proven Formats:

CURIOSITY HOOKS:
- Handle Every ___ Obstacle Easily Using These Tips
- The Ugly Truth About ___
- Why Ignoring ___ Will Cost You Time and Sales
- What Everyone Ought to Know About ___
- The Untold Secret to ___ in Just 3 Days

AUTHORITY HOOKS:
- How To Learn ___ in 5 Minutes
- [Number] Brilliant Ways To Teach Customers About ___
- Little Known Ways to ___
- Professional Tips to Master ___

FEAR/URGENCY HOOKS:
- Mistakes In ___ That Make You Look Stupid
- Warning: ___ is Destroying Your ___
- [Number] Unforgivable Sins Of ___
- Why Your ___ Is Failing (And How To Fix It)

COMPARISON HOOKS:
- Why My ___ Is Better Than Yours
- ___ vs ___ : The Ultimate Showdown
- The Best ___ vs The Rest

OUTCOME HOOKS:
- Double Your Profit With These 5 Tips on ___
- How I Improved My ___ In One Easy Lesson
- The Secret to ___ That Experts Don''t Want You to Know
- Crack The ___ Code

USAGE TIPS:
- Fill in blanks with relevant topic
- Match hook to content type (education, promotion, engagement)
- Test multiple hooks for same content
- Track which hooks perform best for your audience',
'{"category": "content_hooks", "priority": "medium"}'::jsonb);
