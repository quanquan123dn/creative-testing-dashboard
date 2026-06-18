import { NextResponse } from 'next/server';
import { getUnityCreativeStats } from '@/lib/unity-api';

const VALID_PRESETS = ['today', 'yesterday', 'last_7d', 'last_14d', 'last_30d', 'last_90d', 'maximum'];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawPreset = searchParams.get('date_preset') || 'last_30d';
  const datePreset = VALID_PRESETS.includes(rawPreset) ? rawPreset : 'last_30d';

  try {
    const data = await getUnityCreativeStats(datePreset);
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
