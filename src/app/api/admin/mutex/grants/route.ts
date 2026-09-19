import { NextResponse } from 'next/server';

const MUTEX_URL = process.env.MUTEX_URL || 'https://themutex.app';
const MUTEX_ADMIN_SECRET = process.env.MUTEX_ADMIN_SECRET;

const adminUids = (process.env.NEXT_PUBLIC_ADMIN_UIDS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

function extractUidFromToken(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    return payload.user_id || payload.sub || null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const idToken = authHeader.slice(7);
  const uid = extractUidFromToken(idToken);

  if (!uid || !adminUids.includes(uid)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!MUTEX_ADMIN_SECRET) {
    return NextResponse.json(
      { error: 'MUTEX_ADMIN_SECRET not configured' },
      { status: 500 }
    );
  }

  try {
    const res = await fetch(`${MUTEX_URL}/api/admin/pro/grants`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': MUTEX_ADMIN_SECRET,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `Mutex API error: ${res.status}`, details: text },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: 'Failed to reach Mutex API', details: String(e) },
      { status: 502 }
    );
  }
}
