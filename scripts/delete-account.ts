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

async function deleteAccount() {
  console.log(`🔍 Looking for account: ${email}\n`)

  // Step 1: Find the user
  const { data: users, error: userError } = await supabase.auth.admin.listUsers()

  if (userError) {
    console.error('Error listing users:', userError)
    process.exit(1)
  }

  const user = users.users.find(u => u.email === email)

  if (!user) {
    console.log('❌ User not found')
    process.exit(0)
  }

  console.log(`✓ Found user: ${user.id}`)

  // Step 2: Find tenant - check both user metadata and tenants table
  let tenantId = user.user_metadata?.tenant_id
  console.log('User metadata:', user.user_metadata)

  // Also try to find tenant by checking if any tenant references this user
  if (!tenantId) {
    const { data: tenants } = await supabase
      .from('tenants')
      .select('id')
      .limit(100)

    // Check which tenant this user might belong to (could be stored in app_metadata or elsewhere)
    console.log('Checking tenants table for orphaned data...')
  }

  if (tenantId) {
    console.log(`✓ Found tenant: ${tenantId}\n`)

    console.log('🗑️  Deleting tenant data...')

    // Get all leads first for FK deletes
    const { data: leads } = await supabase.from('leads').select('id').eq('tenant_id', tenantId)
    const leadIds = leads?.map(l => l.id) || []

    // Delete in order (respecting foreign keys)
    if (leadIds.length > 0) {
      await supabase.from('research_records').delete().in('lead_id', leadIds)
      console.log('  ✓ Deleted research records')

      await supabase.from('ghl_records').delete().in('lead_id', leadIds)
      console.log('  ✓ Deleted GHL records')

      await supabase.from('pixel_visits').delete().in('lead_id', leadIds)
      console.log('  ✓ Deleted pixel visits')
    }

    await supabase.from('do_not_contact').delete().eq('tenant_id', tenantId)
    console.log('  ✓ Deleted DNC entries')

    await supabase.from('sequence_specs').delete().eq('tenant_id', tenantId)
    console.log('  ✓ Deleted sequences')

    await supabase.from('leads').delete().eq('tenant_id', tenantId)
    console.log('  ✓ Deleted leads')

    await supabase.from('campaigns').delete().eq('tenant_id', tenantId)
    console.log('  ✓ Deleted campaigns')

    await supabase.from('brands').delete().eq('tenant_id', tenantId)
    console.log('  ✓ Deleted brands')

    await supabase.from('tenants').delete().eq('id', tenantId)
    console.log('  ✓ Deleted tenant')

    console.log('')
  }

  // Step 3: Delete auth user
  console.log('🗑️  Deleting user account...')

  // Try deleting with shouldSoftDelete = false to permanently delete
  const { error: deleteUserError } = await supabase.auth.admin.deleteUser(
    user.id,
    false // shouldSoftDelete = false for permanent deletion
  )

  if (deleteUserError) {
    console.error('❌ Error deleting user:', deleteUserError)
    console.log('\n⚠️  Trying alternative deletion method...')

    // Alternative: Use raw SQL to delete
    const { error: sqlError } = await supabase.rpc('exec_sql', {
      sql: `DELETE FROM auth.users WHERE id = '${user.id}'`
    })

    if (sqlError) {
      console.error('❌ SQL deletion also failed:', sqlError)
      console.log('\n💡 Please delete the user manually from Supabase Dashboard:')
      console.log(`   User ID: ${user.id}`)
      console.log(`   Email: ${email}`)
      process.exit(1)
    }
  }

  console.log('✓ User account deleted\n')
  console.log('✅ Account cleanup complete!')
  console.log('\nYou can now test the onboarding flow from scratch!')
}

deleteAccount()
