import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST() {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    
    // Check if user is logged in
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    
    if (sessionError) {
      console.error('Session error:', sessionError)
      return NextResponse.json({ error: 'Authentication error' }, { status: 401 })
    }
    
    if (!sessionData.session) {
      console.log('No session found, redirecting to login')
      return NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'))
    }

    console.log('Creating document for user:', sessionData.session.user.id)
    
    // Create a new document
    const { data: document, error } = await supabase
      .from('documents')
      .insert([
        { 
          owner_id: sessionData.session.user.id,
          title: 'Untitled',
          content_md: '',
          system: 'personal',
          source_kind: 'note',
          status: 'draft',
          style_preset: 'WritersRoom'
        }
      ])
      .select()
      .single()
    
    if (error) {
      console.error('Error creating document:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!document || !document.id) {
      console.error('Document created but no ID returned')
      return NextResponse.json({ error: 'Document creation failed' }, { status: 500 })
    }

    console.log('Document created successfully:', document.id)
    
    // Redirect to the new document
    return NextResponse.redirect(new URL(`/doc/${document.id}`, process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'))
  } catch (err) {
    console.error('Unexpected error in document creation:', err)
    return NextResponse.json({ error: 'Unexpected error occurred' }, { status: 500 })
  }
}
