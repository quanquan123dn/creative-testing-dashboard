import { NextRequest, NextResponse } from 'next/server';

const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const BASE_URL = 'https://graph.facebook.com/v19.0';

export async function GET(request: NextRequest) {
  const videoId = request.nextUrl.searchParams.get('id');
  const adId = request.nextUrl.searchParams.get('ad_id');
  
  if (!videoId && !adId) {
    return NextResponse.json({ error: 'Missing video id or ad_id' }, { status: 400 });
  }

  if (!ACCESS_TOKEN) {
    return NextResponse.json({ error: 'Missing access token' }, { status: 500 });
  }

  try {
    // Strategy 1: Try via ad creative (most reliable with marketing API token)
    if (adId) {
      const adUrl = `${BASE_URL}/${adId}?fields=creative{effective_object_story_spec,object_story_spec,video_id}&access_token=${ACCESS_TOKEN}`;
      const adRes = await fetch(adUrl, { next: { revalidate: 0 } });
      if (adRes.ok) {
        const adData = await adRes.json();
        const creative = adData.creative;
        
        // Try to get video URL from story spec
        const videoData = creative?.effective_object_story_spec?.video_data 
          || creative?.object_story_spec?.video_data;
        
        if (videoData?.video_url) {
          return NextResponse.json({ video_url: videoData.video_url });
        }

        // If we got a video_id from creative, try that
        const creativeVideoId = creative?.video_id || videoId;
        if (creativeVideoId) {
          const vidUrl = await tryGetVideoSource(creativeVideoId);
          if (vidUrl) {
            return NextResponse.json({ video_url: vidUrl });
          }
        }
      }
    }

    // Strategy 2: Try video node directly with multiple field combinations
    if (videoId) {
      const vidUrl = await tryGetVideoSource(videoId);
      if (vidUrl) {
        return NextResponse.json({ video_url: vidUrl });
      }
    }

    return NextResponse.json({ video_url: null, error: 'Video URL not available - permission required' });
  } catch (error) {
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}

async function tryGetVideoSource(videoId: string): Promise<string | null> {
  // Try different field combinations
  const fieldSets = [
    'source',
    'embed_html',
    'permalink_url,source',
  ];

  for (const fields of fieldSets) {
    try {
      const url = `${BASE_URL}/${videoId}?fields=${fields}&access_token=${ACCESS_TOKEN}`;
      const res = await fetch(url, { next: { revalidate: 0 } });
      if (res.ok) {
        const data = await res.json();
        if (data.source) return data.source;
        // Extract video URL from embed_html
        if (data.embed_html) {
          const srcMatch = data.embed_html.match(/src="([^"]+)"/);
          if (srcMatch) return srcMatch[1];
        }
      }
    } catch {
      continue;
    }
  }
  return null;
}
