import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST() {
  const supabase = createRouteHandlerClient({ cookies })
  
  // Check if user is logged in
  const { data: { session } } = await supabase.auth.getSession()
  
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Create a new document
    const { data: document, error } = await supabase
      .from('documents')
      .insert([
        { 
          owner_id: session.user.id,
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

    return NextResponse.json({ document })
  } catch (error) {
    console.error('Error creating document:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
