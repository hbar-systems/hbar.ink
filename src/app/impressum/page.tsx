import Link from 'next/link'

export default function Impressum() {
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
            <Link href="/legal" className="hover:text-gray-900">Legal</Link>
            <Link href="/impressum" className="text-gray-900">Impressum</Link>
          </nav>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 py-16">
        <div className="max-w-2xl mx-auto px-6">
          <h1 className="text-3xl font-semibold text-gray-900 mb-8" style={{ letterSpacing: '-0.02em' }}>
            Impressum / Legal Notice
          </h1>

          <div className="space-y-4 text-gray-700 leading-relaxed">
            <p><strong className="text-gray-900">Operated by:</strong> hbar Overtwo</p>
            <p>
              <strong className="text-gray-900">Postal address:</strong>{' '}
              400 Rella Blvd, Ste 207-632, Montebello, NY 10901, United States
            </p>
            <p>
              <strong className="text-gray-900">Contact:</strong>{' '}
              <a
                href="mailto:hello@hbar.systems"
                className="underline decoration-dotted hover:text-gray-900"
              >
                hello@hbar.systems
              </a>
            </p>
            <p>
              <strong className="text-gray-900">Abuse / security:</strong>{' '}
              <a
                href="mailto:abuse@hbar.systems"
                className="underline decoration-dotted hover:text-gray-900"
              >
                abuse@hbar.systems
              </a>
            </p>
            <p>
              <strong className="text-gray-900">Governance and terms:</strong>{' '}
              <a
                href="https://hbar.legal"
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-dotted hover:text-gray-900"
              >
                hbar.legal
              </a>
            </p>

            <p className="pt-4">
              This site is operated by an independent individual. Where commercial
              services or products are offered, the contracting party is identified
              in writing at the point of transaction. For governance, liability,
              disputes, and data handling see the canonical{' '}
              <a
                href="https://hbar.legal"
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-dotted hover:text-gray-900"
              >
                hbar.legal
              </a>{' '}
              document.
            </p>

            <p>
              Responsible for content per §55 Abs. 2 RStV (where applicable):
              contact via email above.
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
