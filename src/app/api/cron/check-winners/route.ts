import { NextResponse } from 'next/server';
import { put, list } from '@vercel/blob';
import { scoreCreative, DEFAULT_CONFIG } from '@/lib/decision-engine';
import { getAllAdInsights } from '@/lib/meta-api';
import { getAppLovinCreativeStats } from '@/lib/applovin-api';
import { getUnityCreativeStats } from '@/lib/unity-api';

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || '';
const BLOB_KEY = 'notified-alerts/latest.json';

interface NotifiedAlerts {
  video_winners: string[];    // Layer 1 Video winners already notified
  pla_10k: string[];          // Unity PLA creatives that hit 10k impressions
  applovin_10p: string[];     // AppLovin PLA creatives that hit 10 purchasers
  last_checked: string;
  last_notified: string | null;
}

interface AlertCreative {
  name: string;
  ipm: number;
  spend: number;
  installs: number;
  impressions: number;
}

/**
 * Cron endpoint: Check for:
 * 1. New "Winner" (Đạt) creatives on Layer 1 Video (IPM ≥ 7.0)
 * 2. PLA creatives that reached 10k impressions
 * 
 * Sends Discord notification for new alerts only
 */
export async function GET(request: Request) {
  // Verify cron secret (supports both header and query param)
  const authHeader = request.headers.get('authorization');
  const url = new URL(request.url);
  const querySecret = url.searchParams.get('secret');
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // === LAYER 1 VIDEO: Check Winners ===
    let videoWinners: AlertCreative[] = [];
    let totalVideoAds = 0;
    
    try {
      const { ads: metaAds } = await getAllAdInsights('last_14d');
      totalVideoAds = metaAds?.length || 0;
      
      for (const ad of (metaAds || [])) {
        const result = scoreCreative({
          ipm: ad.ipm || 0,
          spend: ad.spend || 0,
          installs: ad.installs || 0,
          impressions: ad.impressions || 0,
          frequency: ad.frequency || 0,
          hook_rate: ad.hook_rate || 0,
          click_to_install: ad.click_to_install || 0,
        }, DEFAULT_CONFIG);

        if (result.decision === 'winner') {
          videoWinners.push({
            name: ad.ad_name || 'Unknown',
            ipm: ad.ipm || 0,
            spend: ad.spend || 0,
            installs: ad.installs || 0,
            impressions: ad.impressions || 0,
          });
        }
      }
    } catch (e) {
      console.error('Video check error:', e);
    }

    // === LAYER 2 PLA: Check 10k Impressions ===
    let pla10k: AlertCreative[] = [];
    let totalPLAAds = 0;

    try {
      const unityData = await getUnityCreativeStats('maximum');
      const creatives = unityData?.creatives || [];
      totalPLAAds = creatives.length;

      for (const c of creatives) {
        if (c.starts >= 10000) {
          pla10k.push({
            name: c.creative_pack_name || 'Unknown',
            ipm: c.ipm || 0,
            spend: c.spend || 0,
            installs: c.installs || 0,
            impressions: c.starts || 0,
          });
        }
      }
    } catch (e) {
      console.error('PLA Unity check error:', e);
    }

    // === APPLOVIN PLA: Check 10 Purchasers ===
    let applovin10p: AlertCreative[] = [];
    let totalAppLovinAds = 0;

    try {
      const alData = await getAppLovinCreativeStats();
      const alAds = alData?.ads || [];
      totalAppLovinAds = alAds.length;

      for (const a of alAds) {
        if (a.sales_3d >= 10) {
          applovin10p.push({
            name: a.creative_set || 'Unknown',
            ipm: a.ir || 0,
            spend: a.cost || 0,
            installs: a.installs || 0,
            impressions: a.impressions || 0,
          });
        }
      }
    } catch (e) {
      console.error('AppLovin check error:', e);
    }

    // === Load previously notified alerts ===
    let prevVideoWinners: string[] = [];
    let prevPla10k: string[] = [];
    let prevApplovin10p: string[] = [];
    try {
      const { blobs } = await list({ prefix: 'notified-alerts' });
      if (blobs.length > 0) {
        const latest = blobs.sort((a, b) => 
          new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
        )[0];
        const res = await fetch(latest.url);
        const data: NotifiedAlerts = await res.json();
        prevVideoWinners = data.video_winners || [];
        prevPla10k = data.pla_10k || [];
        prevApplovin10p = data.applovin_10p || [];
      }
    } catch {
      // First run
    }

    // === Find NEW alerts ===
    const newVideoWinners = videoWinners.filter(w => !prevVideoWinners.includes(w.name));
    const newPla10k = pla10k.filter(p => !prevPla10k.includes(p.name));
    const newApplovin10p = applovin10p.filter(a => !prevApplovin10p.includes(a.name));

    // === Send Discord ===
    let notificationSent = false;
    let discordError: string | null = null;
    if ((newVideoWinners.length > 0 || newPla10k.length > 0 || newApplovin10p.length > 0) && DISCORD_WEBHOOK_URL) {
      try {
        await sendDiscordNotification(newVideoWinners, newPla10k, newApplovin10p, videoWinners.length, totalVideoAds, pla10k.length, totalPLAAds, applovin10p.length, totalAppLovinAds);
        notificationSent = true;
      } catch (e) {
        discordError = e instanceof Error ? e.message : 'Unknown Discord error';
        console.error('Discord notification failed:', discordError);
      }
    }

    // === Save current state ===
    const notifiedData: NotifiedAlerts = {
      video_winners: videoWinners.map(w => w.name),
      pla_10k: pla10k.map(p => p.name),
      applovin_10p: applovin10p.map(a => a.name),
      last_checked: new Date().toISOString(),
      last_notified: notificationSent ? new Date().toISOString() : null,
    };

    try {
      const { blobs: existingBlobs } = await list({ prefix: 'notified-alerts' });
      if (existingBlobs.length > 0) {
        const { del } = await import('@vercel/blob');
        await del(existingBlobs.map(b => b.url));
      }
    } catch { /* ignore */ }

    await put(BLOB_KEY, JSON.stringify(notifiedData), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
    });

    return NextResponse.json({
      success: true,
      video: { total: totalVideoAds, winners: videoWinners.length, new_winners: newVideoWinners.length },
      pla_unity: { total: totalPLAAds, reached_10k: pla10k.length, new_10k: newPla10k.length },
      pla_applovin: { total: totalAppLovinAds, reached_10p: applovin10p.length, new_10p: newApplovin10p.length },
      notification_sent: notificationSent,
      discord_error: discordError,
      new_video_winners: newVideoWinners.map(w => w.name),
      new_pla_10k: newPla10k.map(p => p.name),
      new_applovin_10p: newApplovin10p.map(a => a.name),
    });
  } catch (error: unknown) {
    console.error('Cron check-winners error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}

/**
 * Send Discord webhook with rich embeds for both Video winners and PLA 10k
 */
async function sendDiscordNotification(
  newVideoWinners: AlertCreative[],
  newPla10k: AlertCreative[],
  newApplovin10p: AlertCreative[],
  totalVideoWinners: number,
  totalVideoAds: number,
  totalPla10k: number,
  totalPLAAds: number,
  totalApplovin10p: number,
  totalAppLovinAds: number,
) {
  const embeds: any[] = [];

  // Video Winners embed
  if (newVideoWinners.length > 0) {
    const winnerList = newVideoWinners.map((w, i) => 
      `**${i + 1}. ${w.name}**\n` +
      `   IPM: \`${w.ipm.toFixed(2)}\` | Spend: \`$${w.spend.toFixed(0)}\` | Installs: \`${w.installs}\``
    ).join('\n\n');

    embeds.push({
      title: '🏆 Layer 1 Video — New Winner(s)!',
      description: `**${newVideoWinners.length}** creative(s) mới đạt "Đạt" (IPM ≥ 7.0), sẵn sàng test Layer 2:`,
      color: 0x10b981,
      fields: [
        { name: '📋 New Winners', value: winnerList, inline: false },
        { name: '📊 Summary', value: `Total Winners: **${totalVideoWinners}/${totalVideoAds}** ads`, inline: false },
      ],
    });
  }

  // Unity PLA 10k embed
  if (newPla10k.length > 0) {
    const plaList = newPla10k.map((p, i) => 
      `**${i + 1}. ${p.name}**\n` +
      `   Impressions: \`${p.impressions.toLocaleString()}\` | IPM: \`${p.ipm.toFixed(2)}\` | Installs: \`${p.installs}\` | Spend: \`$${p.spend.toFixed(0)}\``
    ).join('\n\n');

    embeds.push({
      title: '🎯 Layer 2 PLA Unity — Đủ 10K Impressions!',
      description: `**${newPla10k.length}** PLA creative(s) mới đạt đủ 10,000 impressions:`,
      color: 0x8b5cf6,
      fields: [
        { name: '📋 Creatives đủ data', value: plaList, inline: false },
        { name: '📊 Summary', value: `Total ≥10K: **${totalPla10k}/${totalPLAAds}** creatives`, inline: false },
      ],
    });
  }

  // AppLovin PLA 10 purchasers embed
  if (newApplovin10p.length > 0) {
    const alList = newApplovin10p.map((a, i) => 
      `**${i + 1}. ${a.name}**\n` +
      `   Installs: \`${a.installs}\` | Spend: \`$${a.spend.toFixed(0)}\` | IR: \`${a.ipm.toFixed(2)}\``
    ).join('\n\n');

    embeds.push({
      title: '🛒 Layer 2 PLA AppLovin — Đủ 10 Purchasers!',
      description: `**${newApplovin10p.length}** AppLovin creative(s) mới đạt đủ 10 purchasers (D3):`,
      color: 0xf59e0b,
      fields: [
        { name: '📋 Creatives đủ data', value: alList, inline: false },
        { name: '📊 Summary', value: `Total ≥10 purchasers: **${totalApplovin10p}/${totalAppLovinAds}** creatives`, inline: false },
      ],
    });
  }

  // Add footer to last embed
  if (embeds.length > 0) {
    embeds[embeds.length - 1].footer = { text: 'Creative Testing Dashboard — Auto Alert' };
    embeds[embeds.length - 1].timestamp = new Date().toISOString();
  }

  // Truncate field values (Discord limit: 1024 chars per field)
  for (const embed of embeds) {
    if (embed.fields) {
      for (const field of embed.fields) {
        if (field.value && field.value.length > 1000) {
          field.value = field.value.substring(0, 997) + '...';
        }
        if (!field.value) field.value = 'N/A';
      }
    }
    // Truncate description (Discord limit: 4096)
    if (embed.description && embed.description.length > 4000) {
      embed.description = embed.description.substring(0, 3997) + '...';
    }
  }

  const res = await fetch(DISCORD_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    console.error(`Discord webhook error: ${res.status} Body: ${errorBody}`);
    throw new Error(`Discord webhook failed: ${res.status} - ${errorBody}`);
  }
}
