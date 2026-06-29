import { NextRequest, NextResponse } from 'next/server';

const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const BASE_URL = 'https://graph.facebook.com/v19.0';

export async function GET(request: NextRequest) {
  const adId = request.nextUrl.searchParams.get('ad_id');
  const format = request.nextUrl.searchParams.get('format') || 'MOBILE_FEED_STANDARD';
  
  if (!adId) {
    return NextResponse.json({ error: 'Missing ad_id' }, { status: 400 });
  }

  if (!ACCESS_TOKEN) {
    return NextResponse.json({ error: 'Missing access token' }, { status: 500 });
  }

  try {
    const url = `${BASE_URL}/${adId}/previews?ad_format=${format}&access_token=${ACCESS_TOKEN}`;
    const res = await fetch(url, { next: { revalidate: 0 } });
    
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `Meta API error: ${res.status}`, detail: text }, { status: res.status });
    }

    const data = await res.json();
    const previewHtml = data.data?.[0]?.body || null;

    if (!previewHtml) {
      return NextResponse.json({ preview_html: null, error: 'No preview available' });
    }
    
    return NextResponse.json({ preview_html: previewHtml });
  } catch (error) {
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}
