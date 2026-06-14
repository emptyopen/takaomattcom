import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="container">
      <h1>Matt Takao</h1>
      <p>
        Software developer. Currently building{' '}
        <a href="https://apps.apple.com/" target="_blank" rel="noreferrer">
          NextBite
        </a>{' '}
        and a few smaller things.
      </p>

      <h2 style={{ marginTop: 48 }}>Projects</h2>
      <ul>
        <li>
          <strong>NextBite</strong> — household meal-rotation tracker for
          iOS / Android.
        </li>
      </ul>

      <p style={{ marginTop: 64, fontSize: 13 }}>
        <Link href="/admin">Admin</Link>
      </p>
    </main>
  );
}
