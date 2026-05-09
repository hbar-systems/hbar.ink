import Link from 'next/link'

export default function Legal() {
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
            <Link href="/about" className="hover:text-gray-900">About</Link>
            <Link href="/legal" className="text-gray-900">Legal</Link>
            <Link href="/impressum" className="hover:text-gray-900">Impressum</Link>
          </nav>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 py-16">
        <div className="max-w-2xl mx-auto px-6">
          <h1 className="text-3xl font-semibold text-gray-900 mb-8" style={{ letterSpacing: '-0.02em' }}>
            Legal
          </h1>
          
          <div className="space-y-8 text-gray-700">
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">Privacy</h2>
              <p className="leading-relaxed">
                Your drops live in your browser's local storage. They are not sent to any server.
                There are no accounts, no logins, no analytics, no tracking.
              </p>
              <p className="leading-relaxed mt-2">
                If you clear your browser data, your drops go with it. Copy anything you want to keep.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">Terms</h2>
              <p className="leading-relaxed">
                hbar.ink is provided as-is. It is an instrument, not a service.
                Use it to write. Don't use it to harm others or break laws.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">Data Ownership</h2>
              <p className="leading-relaxed">
                You own your content. You can copy any drop out as Markdown at any time.
                Nothing leaves your browser unless you copy it out yourself.
              </p>
            </section>

            <p className="text-sm text-gray-500 pt-4">
              Last updated: February 2026
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="p-6 border-t border-gray-200">
        <div className="max-w-4xl mx-auto text-center text-xs text-gray-500 space-y-2">
          <div>hbar.ink — Phase 1</div>
          <div className="text-gray-400">
            hbar.ink is a project within{' '}
            <a
              href="https://hbar.systems"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 hover:text-gray-700 transition-colors"
            >
              hbar.systems
            </a>
            {' · '}
            <Link href="/impressum" className="text-gray-500 hover:text-gray-700 transition-colors">
              Impressum
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
