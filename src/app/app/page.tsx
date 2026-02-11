import { cookies } from 'next/headers'
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { redirect } from 'next/navigation'

export default async function AppPage() {
  const supabase = createServerComponentClient({ cookies })
  
  // Check if user is logged in
  const { data: { session } } = await supabase.auth.getSession()
  
  if (!session) {
    redirect('/login')
  }

  // Fetch the most recent NON-TERMINAL document
  const { data: documents, error } = await supabase
    .from('documents')
    .select('id, status')
    .eq('owner_id', session.user.id)
    .neq('status', 'terminal')
    .order('updated_at', { ascending: false })
    .limit(1)
  
  // If there's a recent non-terminal document, redirect to it
  if (documents && documents.length > 0) {
    redirect(`/doc/${documents[0].id}`)
  }
  
  // If no non-terminal documents, show welcome message
  // The sidebar will still show all documents including terminal ones
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center max-w-md p-6">
        <h1 className="text-2xl font-bold mb-4">Welcome to hbar.ink</h1>
        <p className="text-gray-600 mb-6">
          Your personal writing studio. Create a new document or select one from the sidebar.
        </p>
        <p className="text-gray-500 text-sm">
          Use the "New Document" button in the sidebar to create a document.
        </p>
      </div>
    </div>
  )
}
