import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

// Receives sendBeacon saves from the editor on unmount/navigation.
// navigator.sendBeacon() is guaranteed to complete even when the page is closing.
export async function POST(request: NextRequest) {
  try {
    const { id, content_md, title } = await request.json()
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const supabase = createRouteHandlerClient({ cookies })
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { error } = await supabase
      .from('documents')
      .update({ content_md, title })
      .eq('id', id)
      .eq('owner_id', session.user.id) // RLS: only own documents

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
