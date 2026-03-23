import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Inbox Concierge',
  description: 'AI-powered email management',
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
