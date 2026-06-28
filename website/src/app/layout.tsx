import type { ReactNode } from 'react';

/**
 * Root layout required by Next.js App Router.
 * The real HTML structure (html, body, providers) lives in
 * app/[locale]/layout.tsx which wraps every page.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children as React.ReactElement;
}
