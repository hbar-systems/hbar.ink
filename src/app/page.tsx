import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#f6f5f2' }}>
      {/* Header */}
      <header className="p-6 border-b border-gray-200">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="text-lg opacity-40">ℏ</span>
            <h1 className="text-lg font-semibold text-gray-900">hbar.ink</h1>
          </div>
          <nav className="flex gap-6 text-sm text-gray-600">
            <Link href="/about" className="hover:text-gray-900">About</Link>
            <Link href="/legal" className="hover:text-gray-900">Legal</Link>
          </nav>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-4xl font-semibold text-gray-900 mb-4" style={{ letterSpacing: '-0.02em' }}>
            A writing instrument.
          </h2>
          <p className="text-gray-600 mb-8">
            Not a platform. Not a service. An instrument.
          </p>
          <Link 
            href="/login"
            className="inline-block px-8 py-3 text-gray-900 border border-gray-300 hover:border-gray-400 transition-colors"
          >
            Enter
          </Link>
          
          {/* Subtle ecosystem reference */}
          <div className="mt-12 flex items-center justify-center gap-2 text-xs text-gray-400">
            <span className="opacity-30">ℏ</span>
            <span>Part of </span>
            <a 
              href="https://hbar.systems" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-gray-500 hover:text-gray-700 transition-colors"
            >
              hbar.systems
            </a>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="p-6 border-t border-gray-200">
        <div className="max-w-4xl mx-auto text-center text-xs text-gray-500">
          hbar.ink — Phase 1
        </div>
      </footer>
    </div>
  )
}
