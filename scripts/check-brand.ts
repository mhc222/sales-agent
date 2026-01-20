import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

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

async function checkBrand() {
  console.log(`🔍 Checking brands for: ${email}\n`)

  // Find user
  const { data: users } = await supabase.auth.admin.listUsers()
  const user = users.users.find(u => u.email === email)

  if (!user) {
    console.log('❌ User not found')
    return
  }

  console.log(`✓ Found user: ${user.id}`)

  // Find tenants for this user
  const { data: userTenants } = await supabase
    .from('user_tenants')
    .select('tenant_id, role')
    .eq('user_id', user.id)

  console.log(`\nTenants: ${userTenants?.length || 0}`)

  if (!userTenants || userTenants.length === 0) {
    console.log('❌ No tenants found')
    return
  }

  for (const ut of userTenants) {
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id, name, slug')
      .eq('id', ut.tenant_id)
      .single()

    console.log(`\n📦 Tenant: ${tenant?.name} (${ut.role})`)
    console.log(`   ID: ${tenant?.id}`)

    // Check brands for this tenant
    const { data: brands } = await supabase
      .from('brands')
      .select('id, name, is_active, created_at')
      .eq('tenant_id', ut.tenant_id)

    console.log(`\n   Brands: ${brands?.length || 0}`)
    if (brands && brands.length > 0) {
      brands.forEach(b => {
        console.log(`   - ${b.name} (active: ${b.is_active})`)
        console.log(`     ID: ${b.id}`)
        console.log(`     Created: ${b.created_at}`)
      })
    } else {
      console.log(`   ⚠️  No brands found! Creating default brand...`)

      // Create a default brand
      const { data: newBrand, error } = await supabase
        .from('brands')
        .insert({
          tenant_id: ut.tenant_id,
          name: tenant?.name || 'Default Brand',
          description: 'Default brand created automatically',
          voice_tone: 'professional',
          is_active: true,
        })
        .select()
        .single()

      if (error) {
        console.error(`   ❌ Failed to create brand:`, error)
      } else {
        console.log(`   ✓ Created brand: ${newBrand.name}`)
        console.log(`     ID: ${newBrand.id}`)
      }
    }
  }
}

checkBrand()
