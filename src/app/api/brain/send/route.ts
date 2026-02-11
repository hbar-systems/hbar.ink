import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export async function POST(request: Request) {
  const supabase = createRouteHandlerClient({ cookies })
  
  // Check if user is logged in
  const { data: { session } } = await supabase.auth.getSession()
  
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Parse the request body
    const payload = await request.json()
    
    // Validate payload
    if (!payload.doc_id || !payload.title || !payload.content_md) {
      return NextResponse.json({ ok: false, error: 'Missing required fields' }, { status: 400 })
    }
    
    // Check if the document belongs to the current user
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', payload.doc_id)
      .eq('owner_id', session.user.id)
      .single()
    
    if (docError || !document) {
      return NextResponse.json({ ok: false, error: 'Document not found or access denied' }, { status: 404 })
    }
    
    // Check AI policy
    if (document.ai_policy === 'deny') {
      return NextResponse.json({ ok: false, error: 'AI policy is set to deny' }, { status: 403 })
    }
    
    // Check if document is in draft status
    if (document.status === 'draft') {
      return NextResponse.json({ ok: false, error: 'Cannot send draft documents to Brain' }, { status: 403 })
    }
    
    // Check if HBAR_BRAIN_URL is configured
    const brainUrl = process.env.NEXT_PUBLIC_HBAR_BRAIN_URL
    if (!brainUrl) {
      return NextResponse.json({ ok: false, error: 'HBAR_BRAIN_URL not configured' }, { status: 500 })
    }
    
    // In a real implementation, this would send the data to the Brain API
    // For v0.1, we just log the payload and return success
    console.log('Brain API payload:', {
      doc_id: payload.doc_id,
      title: payload.title,
      content_md: payload.content_md,
      system: document.system,
      source_kind: document.source_kind,
      status: document.status,
      tags: document.tags,
      created_at: document.created_at,
      updated_at: document.updated_at
    })
    
    // Simulate a successful API call
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error in Brain API:', error)
    return NextResponse.json({ 
      ok: false, 
      error: error instanceof Error ? error.message : 'Internal server error' 
    }, { status: 500 })
  }
}
