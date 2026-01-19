/**
 * Seed LinkedIn Playbook as Global Fundamental
 *
 * Adds the LinkedIn DM playbook to rag_documents as a fundamental (tenant_id = NULL)
 * so it's available to all tenants.
 *
 * Usage:
 *   npx ts-node scripts/seed-linkedin-playbook.ts
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

// Load environment variables
config({ path: '.env.local' })
config({ path: '.env' })

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing required environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

const linkedinPlaybook = `# LinkedIn DM & Outbound Messaging Playbook

## Core Principle

These messages exist for one reason: **start conversations, not pitch.**

You're a stranger. No one cares about your product until they understand how it helps *their* situation.
To understand that situation, you need dialogue.

**The flow always looks like this:**

1. Start a conversation
2. Understand their current situation
3. Identify a real problem
4. Show how your product solves *that* problem

Do not skip steps.

---

## Initial Message Frameworks

### 1. The Relevant Message

**Structure**
* Trigger
* Compliment
* Permission to ask questions

**Template**
\`\`\`
Hey {{first name}} – {{trigger}}. {{compliment}}. Mind if I ask a few questions?
\`\`\`

**Example**
\`\`\`
Hey John – listened to your interview with Sam. Love the process you're using for ramping SDRs. Mind if I ask a few questions about it?
\`\`\`

**Why it works**
* Shows real research
* Explains why you're reaching out
* Asking permission lowers resistance

---

### 2. The Relevant Message (with P.S.)

**Structure**
* Trigger
* Permission to ask questions
* Personalized P.S.

**Example**
\`\`\`
Hey Oliver – saw on Glencourt's LinkedIn that you've expanded into the UK, US, and Europe.
Mind if I ask a few questions about how you're managing currency exposure?

P.S. A sub-4h marathon is insane. I barely survived a 4k yesterday.
\`\`\`

**Why it works**
Adds human texture and personalization without adding friction.

---

### 3. Relevant Message + Curiosity

**Structure**
* Trigger
* Curious how…
* Permission
* P.S.

**Example**
\`\`\`
Hey John – saw on Apple's LinkedIn you operate in the UK and Asia.
Curious how you're managing daily currency exposure.
Mind if I ask a few questions?

P.S. Saw you've been promoted five times there. Congrats.
\`\`\`

**Why it works**
The curiosity line gently surfaces a potential priority without assuming pain.

---

### 4. The Question Message

**Structure**
* Trigger
* Pain
* Permission

**Example**
\`\`\`
Hi Mark – congrats on the launch.
Most international startups pay over 5% in cross-border fees.
Would you mind if I sent something on how we helped Apple reduce this to 2%?
\`\`\`

**Why it works**
Clear, direct, and contextual.
Downside: requires stronger assumptions about pain.

---

### 5. The Video Ask

**Structure**
* Trigger
* Offer to send a video solution

**Example**
\`\`\`
Hey Will – noticed you're onboarding new reps.
Open to me sending a quick video on how teams scale email coaching inside SalesLoft?
\`\`\`

**Why it works**
Best when the trigger clearly maps to a known problem.

---

### 6. Pain + Question

**Structure**
* Pain
* Question

**Example**
\`\`\`
John – most VPs of Sales I speak with struggle to scale relevant outbound messaging.
Have you seen this?
\`\`\`

**Why it works**
Simple and disarming. Invites agreement or correction.

---

## Follow-Up Message Frameworks

### Thoughtful Bump

**Structure**
* Reference known focus
* Ask for feedback

**Example**
\`\`\`
Given you're focused on improving outbound replies, thought this might be useful.
Any thoughts on my last message?
\`\`\`

Or:
\`\`\`
Or am I completely off the mark?
\`\`\`

**Why it works**
* Creates urgency
* Reinforces relevance

---

### One-Liners

**Examples**
* Bad timing?
* Wrong person?
* Already solved?

**Why it works**
Low effort to reply. Easy "yes/no" responses.

---

### Labeling

**Examples**
* Seems like my timing's off.
* Feels like this isn't a priority.
* Looks like I missed the mark.

**Why it works**
People love correcting assumptions.

---

### GIF Follow-Up

**Example**
* "Me waiting for your reply"

**Why it works**
Polarizing but memorable. Use selectively.

---

## Asking Questions After They Reply

### The Rule

Do **not** turn DMs into discovery calls.
You need *just enough* information to uncover pain.

### SPIN Framework (Lightweight)

* **Situation**
  "How are you currently handling X?"

* **Pain**
  "Typically {{role}} struggle with X. Is that showing up for you?"

* **Implication**
  "What impact is that having on Y?"

* **Need Payoff**
  "What would change if you could fix this?"

---

### BAB Framework

* **Before**: Current state
* **After**: Desired outcome
* **Bridge**: How you help them get there

---

## Example Conversation Thread

**Initial Message**
\`\`\`
Hey John – saw on 6sense's LinkedIn you hired two SDRs last month.
Curious how you're handling tactical coaching.
Mind if I ask a few questions?

P.S. Congrats on the promotion streak.
\`\`\`

**Situation**
\`\`\`
How are you onboarding them today?
\`\`\`

**Pain**
\`\`\`
Most heads of sales struggle to make time for 1-1 coaching. Running into that?
\`\`\`

**Implication**
\`\`\`
How's that affecting ramp time?
\`\`\`

**Need Payoff**
\`\`\`
What would change if they had consistent 1-1 coaching?
\`\`\`

**Close**
\`\`\`
Makes sense. We helped Gong cut ramp time to two months.
Worth a quick chat to see if this applies?
\`\`\`

---

## Best Practices

* Keep it short (LinkedIn is mobile-first)
* Personalize every message
* Focus on their problems
* Follow up thoughtfully
* Track responses and refine
* Use soft language: curious, usually, might be

---

## LinkedIn Outreach Process

### Step 1: Connection
* Use Sales Navigator
* No note (or very short)

### Step 2: Familiarity
* Comment thoughtfully on posts
* Add value before asking

### Step 3: Message
* Use a framework
* Or offer genuine value

### Step 4: Questions
* Understand their process
* Identify pain

### Step 5: Next Steps
* Tie solution to *their* pain
* Soft CTA only

---

## Final Reminder

They don't care about your product.
They care about their problems.

Find the pain first. Everything else comes later.`

async function main() {
  console.log('═══════════════════════════════════════')
  console.log('  LinkedIn Playbook Seeder')
  console.log('═══════════════════════════════════════')

  // Check if playbook already exists
  const { data: existing } = await supabase
    .from('rag_documents')
    .select('id')
    .is('tenant_id', null)
    .eq('rag_type', 'fundamental_linkedin')
    .maybeSingle()

  if (existing) {
    console.log('LinkedIn playbook already exists, updating...')
    const { error } = await supabase
      .from('rag_documents')
      .update({
        content: linkedinPlaybook,
        metadata: {
          category: 'linkedin_playbook',
          version: '1.0',
          updated_at: new Date().toISOString(),
        },
      })
      .eq('id', existing.id)

    if (error) {
      console.error('Error updating playbook:', error)
      process.exit(1)
    }
    console.log('✅ LinkedIn playbook updated!')
  } else {
    console.log('Creating new LinkedIn playbook...')
    const { error } = await supabase.from('rag_documents').insert({
      tenant_id: null, // Global fundamental
      rag_type: 'fundamental_linkedin',
      content: linkedinPlaybook,
      metadata: {
        category: 'linkedin_playbook',
        version: '1.0',
        created_at: new Date().toISOString(),
      },
    })

    if (error) {
      console.error('Error creating playbook:', error)
      process.exit(1)
    }
    console.log('✅ LinkedIn playbook created!')
  }

  console.log('\nPlaybook is now available to all tenants.')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error:', err)
    process.exit(1)
  })
