import { NextResponse } from 'next/server';
import { put, list } from '@vercel/blob';
import { scoreCreative, DEFAULT_CONFIG } from '@/lib/decision-engine';
import { getAllAdInsights } from '@/lib/meta-api';

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || '';
const BLOB_KEY = 'notified-alerts/latest.json';

interface NotifiedAlerts {
  completed_l1: string[];     // Creatives that completed L1 (reached 10K impr) - already notified
  last_checked: string;
  last_notified: string | null;
}

interface CompletedCreative {
  name: string;
  ipm: number;
  spend: number;
  installs: number;
  impressions: number;
  decision: string;   // 'winner' | 'watching' | 'kill'
  label: string;      // 'Pass' | 'Iterate' | 'Fail'
}

/**
 * Cron endpoint: Check for Layer 1 Video creatives that just completed testing
 * (reached 10K impressions). Sends Discord notification with their L1 result.
 */
export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  const url = new URL(request.url);
  const querySecret = url.searchParams.get('secret');
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // === Fetch all video ads (maximum range to catch all) ===
    const completedCreatives: CompletedCreative[] = [];
    let totalVideoAds = 0;
    
    try {
      const { ads: metaAds } = await getAllAdInsights('maximum');
      totalVideoAds = metaAds?.length || 0;
      
      for (const ad of (metaAds || [])) {
        // Only consider ads that have reached 10K impressions (L1 test complete)
        if ((ad.impressions || 0) < 10000) continue;

        const result = scoreCreative({
          ipm: ad.ipm || 0,
          spend: ad.spend || 0,
          installs: ad.installs || 0,
          impressions: ad.impressions || 0,
          frequency: ad.frequency || 0,
          hook_rate: ad.hook_rate || 0,
          click_to_install: ad.click_to_install || 0,
        }, DEFAULT_CONFIG);

        completedCreatives.push({
          name: ad.ad_name || 'Unknown',
          ipm: ad.ipm || 0,
          spend: ad.spend || 0,
          installs: ad.installs || 0,
          impressions: ad.impressions || 0,
          decision: result.decision,
          label: result.label,
        });
      }
    } catch (e) {
      console.error('Video check error:', e);
    }

    // === Load previously notified ===
    let prevCompletedL1: string[] = [];
    try {
      const { blobs } = await list({ prefix: 'notified-alerts' });
      if (blobs.length > 0) {
        const latest = blobs.sort((a, b) => 
          new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
        )[0];
        const res = await fetch(latest.url);
        const data: NotifiedAlerts = await res.json();
        prevCompletedL1 = data.completed_l1 || [];
      }
    } catch {
      // First run
    }

    // === Find NEW completions (just reached 10K, not yet notified) ===
    const newlyCompleted = completedCreatives.filter(c => !prevCompletedL1.includes(c.name));

    // === Send Discord ===
    let notificationSent = false;
    let discordError: string | null = null;
    if (newlyCompleted.length > 0 && DISCORD_WEBHOOK_URL) {
      try {
        await sendDiscordNotification(newlyCompleted, completedCreatives.length, totalVideoAds);
        notificationSent = true;
      } catch (err: unknown) {
        discordError = (err as Error)?.message || 'Unknown Discord error';
        console.error('Discord notification failed:', discordError);
      }
    }

    // === Save current state ===
    const notifiedData: NotifiedAlerts = {
      completed_l1: completedCreatives.map(c => c.name),
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
      video: {
        total: totalVideoAds,
        completed_l1: completedCreatives.length,
        newly_completed: newlyCompleted.length,
        new_names: newlyCompleted.map(c => `${c.name} (${c.label})`),
      },
      notification_sent: notificationSent,
      discord_error: discordError,
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
 * Send Discord notification for creatives that just completed L1 testing
 */
async function sendDiscordNotification(
  newlyCompleted: CompletedCreative[],
  totalCompleted: number,
  totalAds: number,
) {
  // Group by result
  const passed = newlyCompleted.filter(c => c.decision === 'winner');
  const iterated = newlyCompleted.filter(c => c.decision === 'watching');
  const failed = newlyCompleted.filter(c => c.decision === 'kill');

  const formatCreative = (c: CompletedCreative) =>
    `IPM: \`${c.ipm.toFixed(2)}\` | Spend: \`$${c.spend.toFixed(0)}\` | Installs: \`${c.installs}\` | Impr: \`${c.impressions.toLocaleString()}\``;

  // Build creative list with emoji per result
  const creativeList = newlyCompleted.map((c) => {
    const emoji = c.decision === 'winner' ? '✅' : c.decision === 'watching' ? '⏳' : '❌';
    return `${emoji} **${c.name.replace(/^TSH\d+_/, '')}** — ${c.label}\n   ${formatCreative(c)}`;
  }).join('\n\n');

  const description = newlyCompleted.length === 1
    ? `**1** creative vừa hoàn thành test Layer 1 (đủ 10K impressions):`
    : `**${newlyCompleted.length}** creatives vừa hoàn thành test Layer 1 (đủ 10K impressions):`;

  const embeds = [{
    title: '📊 Layer 1 Video — Kết Quả Test',
    description,
    color: passed.length > 0 ? 0x10b981 : failed.length > 0 ? 0xef4444 : 0xf59e0b,
    fields: [
      { name: '📋 Kết quả', value: creativeList || 'N/A', inline: false },
      {
        name: '📊 Tổng kết',
        value: `✅ Pass: **${passed.length}** | ⏳ Iterate: **${iterated.length}** | ❌ Fail: **${failed.length}**\nĐã test xong: **${totalCompleted}/${totalAds}** ads`,
        inline: false,
      },
    ],
    footer: { text: 'Creative Testing Dashboard — Auto Alert' },
    timestamp: new Date().toISOString(),
  }];

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
