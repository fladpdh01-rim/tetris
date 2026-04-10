import { NextResponse } from 'next/server';

export async function GET() {
  const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL || '';
  if (!GOOGLE_SCRIPT_URL) {
    return NextResponse.json({ success: false, error: 'Google Script URL not configured' }, { status: 500 });
  }

  try {
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Fetch error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch leaderboard' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL || '';
  if (!GOOGLE_SCRIPT_URL) {
    return NextResponse.json({ success: false, error: 'Google Script URL not configured' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Post error:', error);
    return NextResponse.json({ success: false, error: 'Failed to save score' }, { status: 500 });
  }
}
