import Link from 'next/link';

export default function NotFound() {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#020617', color: '#f1f5f9', fontFamily: 'system-ui, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: '4rem', fontWeight: 800, margin: 0, color: '#38bdf8' }}>404</h1>
          <p style={{ color: '#94a3b8', marginTop: '0.5rem' }}>Page not found</p>
          <a href="/" style={{ display: 'inline-block', marginTop: '1.5rem', background: '#0ea5e9', color: '#fff', padding: '0.6rem 1.5rem', borderRadius: '0.75rem', textDecoration: 'none', fontWeight: 600 }}>
            Go home
          </a>
        </div>
      </body>
    </html>
  );
}
