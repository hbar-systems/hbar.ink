import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { Document } from '@/types/document'

export default async function DocumentList({ 
  userId, 
  status 
}: { 
  userId: string
  status: string
}) {
  const supabase = createServerComponentClient({ cookies })
  
  const { data: documents, error } = await supabase
    .from('documents')
    .select('*')
    .eq('owner_id', userId)
    .eq('status', status)
    .order('updated_at', { ascending: false })
  
  if (error) {
    return <div className="text-red-500">Error loading documents: {error.message}</div>
  }

  if (!documents || documents.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No documents found. Create a new one to get started.</p>
      </div>
    )
  }

  return (
    <div className="bg-white shadow overflow-hidden sm:rounded-md">
      <ul className="divide-y divide-gray-200">
        {documents.map((doc: Document) => (
          <li key={doc.id}>
            <Link href={`/doc/${doc.id}`} className="block hover:bg-gray-50">
              <div className="px-4 py-4 sm:px-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <p className="text-sm font-medium text-primary-600 truncate">{doc.title}</p>
                    <div className="ml-2 flex-shrink-0 flex">
                      <p className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                        {doc.system}
                      </p>
                    </div>
                  </div>
                  <div className="ml-2 flex-shrink-0 flex">
                    <p className="text-sm text-gray-500">
                      {formatDistanceToNow(new Date(doc.updated_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
                <div className="mt-2 sm:flex sm:justify-between">
                  <div className="sm:flex">
                    <p className="flex items-center text-sm text-gray-500">
                      {doc.source_kind}
                    </p>
                  </div>
                  <div className="mt-2 flex items-center text-sm text-gray-500 sm:mt-0">
                    <p>
                      {doc.tags && doc.tags.length > 0 ? doc.tags.join(', ') : 'No tags'}
                    </p>
                  </div>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
