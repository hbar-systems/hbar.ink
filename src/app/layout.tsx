import './globals.css'
import type { Metadata } from 'next'
import { Quicksand, Montserrat, Audiowide, Spectral } from 'next/font/google'

const quicksand = Quicksand({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-quicksand',
})

const montserrat = Montserrat({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-montserrat',
})

const audiowide = Audiowide({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-audiowide',
})

const spectral = Spectral({
  weight: ['300', '400', '600', '700'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-spectral',
})

export const metadata: Metadata = {
  title: 'hbar.ink',
  description: 'A beautiful, reliable personal writing tool',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${quicksand.variable} ${montserrat.variable} ${audiowide.variable} ${spectral.variable}`}>
        {children}
      </body>
    </html>
  )
}
