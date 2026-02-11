import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-4">Document Not Found</h2>
        <p className="text-gray-600 mb-6">The document you're looking for doesn't exist or you don't have permission to view it.</p>
        <Link 
          href="/app" 
          className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors"
        >
          Return to Documents
        </Link>
      </div>
    </div>
  )
}
