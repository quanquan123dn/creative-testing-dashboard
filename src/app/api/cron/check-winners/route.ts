import { NextResponse } from 'next/server';
import { put, list } from '@vercel/blob';
import { scoreCreative, DEFAULT_CONFIG } from '@/lib/decision-engine';
import { getAllAdInsights } from '@/lib/meta-api';

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || '';
const BLOB_KEY = 'notified-winners/latest.json';

interface NotifiedWinners {
  ad_names: string[];
  last_checked: string;
  last_notified: string | null;
}

/**
 * Cron endpoint: Check for new "Winner" (Đạt) creatives
 * and send Discord notification
 * 
 * Runs every 6 hours via Vercel Cron
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
    // 1. Fetch current ad data from Meta
    const { ads: metaAds } = await getAllAdInsights('last_14d');
    
    if (!metaAds || metaAds.length === 0) {
      return NextResponse.json({ success: true, message: 'No ads data' });
    }

    // 2. Score each ad with decision engine
    const winners: { name: string; ipm: number; spend: number; installs: number; impressions: number }[] = [];
    
    for (const ad of metaAds) {
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
        winners.push({
          name: ad.ad_name || 'Unknown',
          ipm: ad.ipm || 0,
          spend: ad.spend || 0,
          installs: ad.installs || 0,
          impressions: ad.impressions || 0,
        });
      }
    }

    // 3. Load previously notified winners from Blob
    let previouslyNotified: string[] = [];
    try {
      const { blobs } = await list({ prefix: 'notified-winners' });
      if (blobs.length > 0) {
        const latest = blobs.sort((a, b) => 
          new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
        )[0];
        const res = await fetch(latest.url);
        const data: NotifiedWinners = await res.json();
        previouslyNotified = data.ad_names || [];
      }
    } catch {
      // First run, no previous data
    }

    // 4. Find NEW winners (not previously notified)
    const newWinners = winners.filter(w => !previouslyNotified.includes(w.name));

    // 5. Send Discord notification for new winners
    let notificationSent = false;
    if (newWinners.length > 0 && DISCORD_WEBHOOK_URL) {
      await sendDiscordNotification(newWinners, winners.length, metaAds.length);
      notificationSent = true;
    }

    // 6. Save current winners list to Blob
    const notifiedData: NotifiedWinners = {
      ad_names: winners.map(w => w.name),
      last_checked: new Date().toISOString(),
      last_notified: notificationSent ? new Date().toISOString() : null,
    };

    await put(BLOB_KEY, JSON.stringify(notifiedData), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
    });

    return NextResponse.json({
      success: true,
      total_ads: metaAds.length,
      total_winners: winners.length,
      new_winners: newWinners.length,
      notification_sent: notificationSent,
      winners: winners.map(w => w.name),
      new_winner_names: newWinners.map(w => w.name),
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
 * Send Discord webhook with rich embed
 */
async function sendDiscordNotification(
  newWinners: { name: string; ipm: number; spend: number; installs: number; impressions: number }[],
  totalWinners: number,
  totalAds: number
) {
  const winnerList = newWinners.map((w, i) => 
    `**${i + 1}. ${w.name}**\n` +
    `   IPM: \`${w.ipm.toFixed(2)}\` | Spend: \`$${w.spend.toFixed(0)}\` | Installs: \`${w.installs}\``
  ).join('\n\n');

  const embed = {
    embeds: [{
      title: '🏆 New Creative(s) Ready for Layer 2!',
      description: `**${newWinners.length}** creative(s) mới đạt tiêu chuẩn "Đạt" (IPM ≥ 7.0) và sẵn sàng test Layer 2:`,
      color: 0x10b981, // Emerald green
      fields: [
        {
          name: '📋 New Winners',
          value: winnerList || 'None',
          inline: false,
        },
        {
          name: '📊 Summary',
          value: `Total Winners: **${totalWinners}/${totalAds}** ads\nBenchmark: IPM ≥ 7.0, Spend ≥ $10, Installs ≥ 5`,
          inline: false,
        },
      ],
      footer: {
        text: 'Creative Testing Dashboard — Auto Alert',
      },
      timestamp: new Date().toISOString(),
    }],
  };

  const res = await fetch(DISCORD_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(embed),
  });

  if (!res.ok) {
    console.error(`Discord webhook error: ${res.status} ${await res.text()}`);
    throw new Error(`Discord webhook failed: ${res.status}`);
  }
}
