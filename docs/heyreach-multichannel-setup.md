# HeyReach Multi-Channel Campaign Setup

Campaign ID: **307593** ("Multi Channel")
Lead List ID: **490210** ("Multi-Channel Leads")

## Sequence Configuration (Using AI-Generated Placeholders)

The AI writing agent generates all LinkedIn messages. Configure HeyReach to use these custom field placeholders.

**Important: HeyReach Fallbacks**

HeyReach requires fallback messages when using variables. **The fallback field must be static text, not another variable.**

For **Connection Requests**: The `{{connection_note}}` variable is always populated (AI content → AI fallback → system default), so the fallback is rarely used. Enter this static fallback in HeyReach:
> "Hey - sent you an email recently, thought I'd connect here too."

For **Messages**: Use the `_fallback` variable in the message field, OR enter static fallback text directly:
- Option A: Use `{{linkedin_message_1_fallback}}` as the fallback (populated by AI or system)
- Option B: Enter static text directly in HeyReach UI

### Step 1: Connection Request (Day 1)
- **Action:** Send Connection Request
- **Delay:** Immediate (Day 1)
- **Note:** `{{connection_note}}`
- **Fallback Note (static):** `Hey - sent you an email recently, thought I'd connect here too.`
- **Condition:** None (always send)

### Step 2: First Message (Day 3)
- **Action:** Send Message
- **Delay:** 2 days after connection accepted
- **Condition:** Connection accepted
- **Message:** `{{linkedin_message_1}}`
- **Fallback:** `{{linkedin_message_1_fallback}}`

### Step 3: Follow-up Message (Day 7)
- **Action:** Send Message
- **Delay:** 4 days after previous message
- **Condition:** No reply received
- **Message:** `{{linkedin_message_2}}`
- **Fallback:** `{{linkedin_message_2_fallback}}`

### Step 4: Final Touch (Day 15)
- **Action:** Send Message
- **Delay:** 8 days after previous message
- **Condition:** No reply received
- **Message:** `{{linkedin_message_3}}`
- **Fallback:** `{{linkedin_message_3_fallback}}`

## Coordination with SmartLead Email

| Day | Email (SmartLead) | LinkedIn (HeyReach) |
|-----|------------------|---------------------|
| 1   | Email 1 (TIPS)   | Connection Request  |
| 3   | Email 2 (Value)  | Message 1 (if connected) |
| 5   | Email 3 (Bump)   | -                   |
| 7   | -                | Message 2           |
| 12  | Email 4 (New Thread) | -              |
| 15  | Email 5 (Case Study) | Message 3       |
| 18  | Email 6 (Bump)   | -                   |
| 21  | Email 7 (Referral) | -                 |

## Conditional Copy Flow

When LinkedIn events occur, the orchestrator updates SmartLead email copy:

1. **Connection Accepted** → Future emails reference LinkedIn connection
   - "Saw we connected on LinkedIn..."

2. **LinkedIn Reply** → Future emails acknowledge the conversation
   - "Following up on our LinkedIn chat..."

## Campaign Settings

In HeyReach dashboard, configure:

- **Stop on Reply:** YES (let orchestrator handle)
- **Exclude in Other Campaigns:** Recommended
- **Working Hours:** Match SmartLead (Mon-Fri, 7am-7pm ET)

## Webhook Configuration

Already configured - all events go to:
`https://swedishnationalsalesteam.com/api/webhooks/heyreach`

Events tracked:
- CONNECTION_REQUEST_SENT
- CONNECTION_REQUEST_ACCEPTED
- MESSAGE_SENT
- MESSAGE_REPLY_RECEIVED
- INMAIL_SENT / INMAIL_REPLY_RECEIVED
- VIEWED_PROFILE / LIKED_POST / FOLLOW_SENT
- CAMPAIGN_COMPLETED
- LEAD_TAG_UPDATED

## Adding Leads

Leads are added via the orchestrator when a multi-channel sequence is deployed. The AI-generated content is passed as custom fields:

```typescript
import * as heyreach from '../lib/heyreach'

// Orchestrator deploys lead with AI-generated LinkedIn sequence
await heyreach.deployLeadToMultiChannelCampaign(
  { apiKey: process.env.HEYREACH_API_KEY },
  '307593', // Multi-Channel campaign ID
  {
    linkedin_url: lead.linkedin_url,
    first_name: lead.first_name,
    last_name: lead.last_name,
    company_name: lead.company_name,
    job_title: lead.title,
    email: lead.email,
  },
  sequence // Contains linkedin_steps with AI-generated body, connection_note, etc.
)
```

The `formatLinkedInSequenceAsCustomFields()` function converts the sequence into:
```json
{
  "connection_note": "Hey John, saw your post about...",
  "connection_note_fallback": "Hi - came across your profile and thought it'd be worth connecting.",
  "linkedin_message_1": "Thanks for connecting! Quick question about [specific topic]...",
  "linkedin_message_1_fallback": "Thanks for connecting! What's the biggest challenge you're facing right now?",
  "linkedin_message_2": "Wanted to bump this up - noticed you [specific action]...",
  "linkedin_message_2_fallback": "Hey - wanted to bump this up. Curious if you've had a chance to think about it.",
  "linkedin_message_3": "Last note from me on [specific topic]...",
  "linkedin_message_3_fallback": "Last note from me - if now's not the right time, totally understand."
}
```

**Default Fallbacks** (reference emails - used when AI doesn't generate them):
- `connection_note`: "Hey - sent you an email recently, thought I'd connect here too."
- `linkedin_message_1_fallback`: "Thanks for connecting! Wanted to follow up on the email I sent - did it land?"
- `linkedin_message_2_fallback`: "Hey - circling back on my email. Easier to chat here if you prefer LinkedIn."
- `linkedin_message_3_fallback`: "Last note - sent a few emails your way. If LinkedIn works better, happy to chat here instead."

## Visual Sequence Builder

In HeyReach dashboard, create this flow:

```
┌─────────────────────────────────────────────────────────┐
│  START                                                   │
│    ↓                                                     │
│  [Connection Request]                                    │
│    Note: {{connection_note}}                            │
│    Fallback: Hey - sent you an email recently...        │
│    ↓                                                     │
│  [Wait: until connected, max 7 days]                    │
│    ↓                                                     │
│  [IF Connected] → [Send Message]                        │
│    Body: {{linkedin_message_1}}                         │
│    Fallback: {{linkedin_message_1_fallback}}            │
│    ↓                                                     │
│  [Wait: 4 days]                                         │
│    ↓                                                     │
│  [IF No Reply] → [Send Message]                         │
│    Body: {{linkedin_message_2}}                         │
│    Fallback: {{linkedin_message_2_fallback}}            │
│    ↓                                                     │
│  [Wait: 8 days]                                         │
│    ↓                                                     │
│  [IF No Reply] → [Send Message]                         │
│    Body: {{linkedin_message_3}}                         │
│    Fallback: {{linkedin_message_3_fallback}}            │
│    ↓                                                     │
│  END                                                     │
└─────────────────────────────────────────────────────────┘
```
