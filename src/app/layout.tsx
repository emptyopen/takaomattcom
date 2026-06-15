import type { Metadata } from 'next';
import { Chakra_Petch } from 'next/font/google';
import './globals.css';

// Self-hosted at build time by next/font — no manual download needed. Swap the
// import (e.g. Sora, Outfit, Inter) to change the site font. Chakra Petch is a
// non-variable font, so explicit weights are required.
const display = Chakra_Petch({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-display',
});

export const metadata: Metadata = {
  title: 'Matt Takao',
  description: 'Software developer at Google.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={display.variable}>
      <body>{children}</body>
    </html>
  );
}
