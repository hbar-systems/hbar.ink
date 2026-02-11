import { cookies } from 'next/headers'
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { redirect } from 'next/navigation'
import DocumentEditor from './document-editor'
import { Document } from '@/types/document'

export default async function DocumentPage({ params }: { params: { id: string } }) {
  if (!params.id) {
    console.error('No document ID provided')
    redirect('/app?error=missing-id')
  }

  try {
    const supabase = createServerComponentClient({ cookies })
    
    // Check if user is logged in
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    
    if (sessionError) {
      console.error('Session error:', sessionError)
      throw new Error(`Authentication error: ${sessionError.message}`)
    }
    
    if (!sessionData.session) {
      console.log('No session found, redirecting to login')
      redirect('/login')
    }

    console.log(`Fetching document ${params.id} for user ${sessionData.session.user.id}`)

    // Fetch the document
    const { data: document, error } = await supabase
      .from('documents')
      .select('*')
      .eq('id', params.id)
      .eq('owner_id', sessionData.session.user.id)
      .single()
    
    if (error) {
      console.error('Error fetching document:', error)
      throw new Error(`Failed to fetch document: ${error.message}`)
    }
    
    if (!document) {
      console.error('Document not found')
      redirect('/app?error=document-not-found')
    }

    console.log('Document fetched successfully')

    return <DocumentEditor document={document as Document} />
  } catch (err) {
    console.error('Unexpected error in document page:', err)
    throw err // Let the error boundary handle it
  }
}
