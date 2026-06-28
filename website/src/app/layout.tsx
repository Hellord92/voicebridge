import React from 'react';

/**
 * Root layout required by Next.js App Router.
 * Real html/body structure lives in app/[locale]/layout.tsx.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
