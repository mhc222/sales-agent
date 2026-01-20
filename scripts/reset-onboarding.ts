import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config()

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

const email = 'mhc222@gmail.com'

async function resetOnboarding() {
  console.log(`🔍 Looking for account: ${email}\n`)

  // Step 1: Find the user
  const { data: users, error: userError } = await supabase.auth.admin.listUsers()

  if (userError) {
    console.error('Error listing users:', userError)
    process.exit(1)
  }

  const user = users.users.find(u => u.email === email)

  if (!user) {
    console.log('❌ User not found - you can start fresh with onboarding!')
    process.exit(0)
  }

  console.log(`✓ Found user: ${user.id}`)

  // Step 2: Find and delete all tenant data
  const { data: tenants } = await supabase
    .from('tenants')
    .select('id')

  if (tenants && tenants.length > 0) {
    console.log(`\nFound ${tenants.length} tenant(s), cleaning up all data...\n`)

    for (const tenant of tenants) {
      const tenantId = tenant.id

      // Get all leads first for FK deletes
      const { data: leads } = await supabase.from('leads').select('id').eq('tenant_id', tenantId)
      const leadIds = leads?.map(l => l.id) || []

      // Delete in order (respecting foreign keys)
      if (leadIds.length > 0) {
        await supabase.from('research_records').delete().in('lead_id', leadIds)
        await supabase.from('ghl_records').delete().in('lead_id', leadIds)
        await supabase.from('pixel_visits').delete().in('lead_id', leadIds)
      }

      await supabase.from('do_not_contact').delete().eq('tenant_id', tenantId)
      await supabase.from('sequence_specs').delete().eq('tenant_id', tenantId)
      await supabase.from('leads').delete().eq('tenant_id', tenantId)
      await supabase.from('campaigns').delete().eq('tenant_id', tenantId)
      await supabase.from('brands').delete().eq('tenant_id', tenantId)

      // Reset tenant settings to clear onboarding state
      await supabase
        .from('tenants')
        .update({
          settings: {
            onboarding_completed: false,
            onboarding_step: 0
          }
        })
        .eq('id', tenantId)

      console.log(`  ✓ Cleaned tenant: ${tenantId}`)
    }
  }

  console.log('\n✅ Account reset complete!')
  console.log('\nYou can now test the onboarding flow from scratch!')
  console.log(`Visit: http://localhost:3000/onboarding`)
}

resetOnboarding()
