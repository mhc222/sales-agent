import { NextResponse } from 'next/server'
import { createClient } from '@/src/lib/supabase-server'
import { createServiceClient } from '@/src/lib/supabase-server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: userTenant } = await supabase
      .from('user_tenants')
      .select('tenant:tenants(id)')
      .eq('user_id', user.id)
      .single()

    if (!userTenant?.tenant) {
      return NextResponse.json({ error: 'No tenant found' }, { status: 400 })
    }

    const tenantId = (userTenant.tenant as any).id as string

    // Parse form data
    const formData = await request.formData()
    const file = formData.get('file') as File
    const reason = formData.get('reason') as string | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Read file content
    const text = await file.text()
    const lines = text.split(/[\n,]/).map((l) => l.trim().toLowerCase()).filter(Boolean)

    // Parse entries
    const entries: Array<{
      tenant_id: string
      email: string | null
      domain: string | null
      reason: string | null
      added_by: string
    }> = []

    for (const line of lines) {
      // Skip header rows
      if (line === 'email' || line === 'domain') continue

      const isEmail = line.includes('@')
      entries.push({
        tenant_id: tenantId,
        email: isEmail ? line : null,
        domain: isEmail ? null : line,
        reason: reason || 'Uploaded via CSV',
        added_by: user.id,
      })
    }

    if (entries.length === 0) {
      return NextResponse.json({ error: 'No valid entries found in file' }, { status: 400 })
    }

    const serviceClient = createServiceClient()

    // Insert in batches to avoid timeout
    const batchSize = 100
    let added = 0
    let skipped = 0

    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize)

      const { data, error } = await serviceClient
        .from('do_not_contact')
        .upsert(batch, {
          onConflict: 'tenant_id,email',
          ignoreDuplicates: true,
        })
        .select()

      if (error) {
        console.error('DNC batch insert error:', error)
        // Continue with next batch
        skipped += batch.length
      } else {
        added += data?.length || 0
        skipped += batch.length - (data?.length || 0)
      }
    }

    return NextResponse.json({
      added,
      skipped,
      total: entries.length,
    })
  } catch (error) {
    console.error('DNC upload error:', error)
    return NextResponse.json({ error: 'Failed to process file' }, { status: 500 })
  }
}
