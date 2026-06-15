'use client';

import { useState } from 'react';

// Shows /me.jpg once it's dropped into public/. Until then (or on any load
// error) it falls back to monogram initials so the layout never breaks.
export default function Avatar() {
  const [ok, setOk] = useState(true);
  return (
    <div className="avatar">
      {ok ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/me.jpg" alt="Matt Takao" onError={() => setOk(false)} />
      ) : (
        <span className="avatar-fallback">MT</span>
      )}
    </div>
  );
}
