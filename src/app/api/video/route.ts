import { NextRequest, NextResponse } from 'next/server';

const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;
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
    // Strategy 1: Via ad creative effective_object_story_spec
    if (adId) {
      const result = await tryViaAdCreative(adId);
      if (result) return NextResponse.json({ video_url: result });
    }

    // Strategy 2: Via advideos endpoint (ad account level)
    if (videoId && AD_ACCOUNT_ID) {
      const result = await tryViaAdVideos(videoId);
      if (result) return NextResponse.json({ video_url: result });
    }

    // Strategy 3: Direct video node
    if (videoId) {
      const result = await tryDirectVideo(videoId);
      if (result) return NextResponse.json({ video_url: result });
    }

    return NextResponse.json({ video_url: null, error: 'Video URL not available' });
  } catch (error) {
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}

async function tryViaAdCreative(adId: string): Promise<string | null> {
  try {
    const url = `${BASE_URL}/${adId}?fields=creative{effective_object_story_spec,object_story_spec}&access_token=${ACCESS_TOKEN}`;
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) return null;
    const data = await res.json();
    const creative = data.creative;
    const videoData = creative?.effective_object_story_spec?.video_data 
      || creative?.object_story_spec?.video_data;
    return videoData?.video_url || videoData?.call_to_action?.value?.link || null;
  } catch { return null; }
}

async function tryViaAdVideos(videoId: string): Promise<string | null> {
  try {
    // Use ad account's advideos endpoint
    const url = `${BASE_URL}/act_${AD_ACCOUNT_ID}/advideos?filtering=[{"field":"id","operator":"EQUAL","value":"${videoId}"}]&fields=source,permalink_url&access_token=${ACCESS_TOKEN}`;
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) return null;
    const data = await res.json();
    const video = data.data?.[0];
    return video?.source || null;
  } catch { return null; }
}

async function tryDirectVideo(videoId: string): Promise<string | null> {
  try {
    const url = `${BASE_URL}/${videoId}?fields=source&access_token=${ACCESS_TOKEN}`;
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) return null;
    const data = await res.json();
    return data.source || null;
  } catch { return null; }
}
