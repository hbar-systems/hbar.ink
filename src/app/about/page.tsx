import Link from 'next/link'

export default function About() {
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#f6f5f2' }}>
      {/* Header */}
      <header className="p-6 border-b border-gray-200">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2 text-lg font-semibold text-gray-900 hover:text-gray-700">
            <span className="opacity-40">ℏ</span>
            <span>hbar.ink</span>
          </Link>
          <nav className="flex gap-6 text-sm text-gray-600">
            <Link href="/about" className="text-gray-900">About</Link>
            <Link href="/legal" className="hover:text-gray-900">Legal</Link>
          </nav>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 py-16">
        <div className="max-w-2xl mx-auto px-6">
          <h1 className="text-3xl font-semibold text-gray-900 mb-8" style={{ letterSpacing: '-0.02em' }}>
            About hbar.ink
          </h1>
          
          <div className="space-y-6 text-gray-700 leading-relaxed">
            <div>
              <p>
                hbar.ink is a writing instrument. Not a platform. Not a service. An instrument.
              </p>
              
              <p className="mt-4">
                It does one thing: give you a clean space to write. No distractions. No features you don't need. 
                No social layer. No analytics. No growth hacking.
              </p>
              
              <p className="mt-4">
                Two modes: Writer's Room (light, for drafting) and Night Ink (dark, for immersion). 
                Your documents. Your words. Your focus.
              </p>
              
              <p className="mt-4">
                This is Phase 1. The instrument layer. Frozen. Stable. Intentional.
              </p>
            </div>
            
            <div className="border-l-2 border-gray-300 pl-4 py-2 text-gray-600 italic">
              <p className="text-sm leading-relaxed">
                hbar.ink is built on the belief that tools shape thought.<br/>
                Minimal structure enables clarity.<br/>
                Stability enables trust.<br/>
                Restraint enables focus.
              </p>
            </div>
            
            <p className="text-sm text-gray-500 pt-2">
              Built with Next.js, TypeScript, and Supabase.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="p-6 border-t border-gray-200">
        <div className="max-w-4xl mx-auto text-center text-xs text-gray-500 space-y-2">
          <div>hbar.ink — Phase 1</div>
          <div className="text-gray-400">
            Part of{' '}
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
      </footer>
    </div>
  )
}
