import { NextRequest, NextResponse } from 'next/server';

const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const BASE_URL = 'https://graph.facebook.com/v19.0';

export async function GET(request: NextRequest) {
  const videoId = request.nextUrl.searchParams.get('id');
  
  if (!videoId) {
    return NextResponse.json({ error: 'Missing video id' }, { status: 400 });
  }

  if (!ACCESS_TOKEN) {
    return NextResponse.json({ error: 'Missing access token' }, { status: 500 });
  }

  try {
    const url = `${BASE_URL}/${videoId}?fields=source,thumbnails&access_token=${ACCESS_TOKEN}`;
    const res = await fetch(url, { next: { revalidate: 0 } });
    
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `Meta API error: ${res.status}`, detail: text }, { status: res.status });
    }

    const data = await res.json();
    
    return NextResponse.json({
      video_url: data.source || null,
      thumbnails: data.thumbnails?.data || [],
    });
  } catch (error) {
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}
