import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function showMemories() {
  // Get email from command line args, or default to Lindsay
  const email = process.argv[2] || 'lwaiser@dglaw.com'

  // Get lead
  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('id, first_name, last_name, email, company_name, job_title')
    .eq('email', email)
    .single()

  if (leadError || !lead) {
    console.error(`Lead not found: ${email}`)
    return
  }

  // Get memories
  const { data: memories, error: memError } = await supabase
    .from('lead_memories')
    .select('*')
    .eq('lead_id', lead.id)
    .order('created_at', { ascending: true })

  if (memError) {
    console.error('Error fetching memories:', memError)
    return
  }

  console.log('╔══════════════════════════════════════════════════════════════════╗')
  console.log('║                    LEAD MEMORY TIMELINE                          ║')
  console.log('╚══════════════════════════════════════════════════════════════════╝')
  console.log('')
  console.log(`▸ LEAD: ${lead.first_name} ${lead.last_name}`)
  console.log(`  Email: ${lead.email}`)
  console.log(`  Title: ${lead.job_title}`)
  console.log(`  Company: ${lead.company_name}`)
  console.log('')
  console.log(`▸ MEMORIES: ${memories?.length || 0} total`)
  console.log('─'.repeat(70))

  if (!memories || memories.length === 0) {
    console.log('  No memories found for this lead')
    return
  }

  memories.forEach((m, i) => {
    const date = new Date(m.created_at).toLocaleString()
    const sourceIcon = getSourceIcon(m.source)
    const typeColor = getTypeLabel(m.memory_type)

    console.log('')
    console.log(`${sourceIcon} #${i + 1} [${m.source}] ${typeColor}`)
    console.log(`   ${date}`)
    console.log(`   ${m.summary || 'No summary'}`)

    // Show key details based on memory type
    if (m.memory_type === 'research' && m.content) {
      const c = m.content
      if (c.persona_match) {
        console.log(`   ├─ Persona: ${c.persona_match.type} (${c.persona_match.decision_level})`)
      }
      if (c.relationship) {
        console.log(`   ├─ Relationship: ${c.relationship.type}`)
        if (c.relationship.opening_question) {
          console.log(`   ├─ Opening: "${c.relationship.opening_question.substring(0, 60)}..."`)
        }
      }
      if (c.triggers) {
        console.log(`   └─ Triggers: ${c.triggers.length} found`)
      }
    }

    if (m.memory_type === 'sequence_sent' && m.content) {
      const c = m.content
      console.log(`   ├─ Email #: ${c.email_number || 'N/A'}`)
      console.log(`   ├─ Subject: ${c.subject || 'N/A'}`)
      console.log(`   └─ Angle: ${c.angle || 'N/A'}`)
    }

    if (m.memory_type === 'reply' && m.content) {
      const c = m.content
      console.log(`   ├─ Sentiment: ${c.sentiment || 'N/A'}`)
      console.log(`   └─ Reply: "${(c.reply_text || c.text || 'N/A').substring(0, 80)}..."`)
    }

    if (m.memory_type === 'status_change' && m.content) {
      const c = m.content
      console.log(`   ├─ From: ${c.from_status || 'N/A'}`)
      console.log(`   └─ To: ${c.to_status || 'N/A'}`)
    }

    if (m.memory_type === 'note' && m.content) {
      console.log(`   └─ Note: "${(m.content.note || m.content.text || '').substring(0, 100)}"`)
    }

    console.log('─'.repeat(70))
  })
}

function getSourceIcon(source: string): string {
  const icons: Record<string, string> = {
    agent1_qualification: '🎯',
    agent2_research: '🔍',
    agent3_writer: '✍️',
    email_webhook: '📧',
    linkedin_webhook: '💼',
    human: '👤',
    system: '⚙️',
  }
  return icons[source] || '📝'
}

function getTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    research: 'RESEARCH',
    qualification: 'QUALIFICATION',
    sequence_sent: 'SEQUENCE SENT',
    email_sent: 'EMAIL SENT',
    reply: 'REPLY RECEIVED',
    reply_received: 'REPLY RECEIVED',
    status_change: 'STATUS CHANGE',
    meeting_booked: 'MEETING BOOKED',
    note: 'NOTE',
    follow_up_scheduled: 'FOLLOW-UP',
    objection: 'OBJECTION',
    disqualified: 'DISQUALIFIED',
  }
  return labels[type] || type.toUpperCase()
}

showMemories()
