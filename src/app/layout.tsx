import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Matt Takao',
  description: 'Projects, apps, and miscellany.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
