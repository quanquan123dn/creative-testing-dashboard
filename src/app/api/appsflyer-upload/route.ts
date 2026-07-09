import { put, list } from '@vercel/blob';
import { NextRequest, NextResponse } from 'next/server';

const BLOB_PREFIX = 'appsflyer-data';

interface AppsFlyerRow {
  adset_name: string;
  roas_d3: number;
  buyer_rate_d3: number;
  [key: string]: string | number;
}

/**
 * POST: Upload 1 or 2 CSV files, merge by adset_name
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('file') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
    }

    // Parse all uploaded files
    const allParsed: AppsFlyerRow[][] = [];
    for (const file of files) {
      const csv = await file.text();
      const parsed = parseCSV(csv);
      if (parsed.length > 0) allParsed.push(parsed);
    }

    if (allParsed.length === 0) {
      return NextResponse.json({ success: false, error: 'No data found in any CSV file' }, { status: 400 });
    }

    // Load existing stored data to merge with
    let existingRows: AppsFlyerRow[] = [];
    try {
      const { blobs } = await list({ prefix: BLOB_PREFIX });
      if (blobs.length > 0) {
        const latestBlob = blobs.sort((a, b) =>
          new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
        )[0];
        const existingRes = await fetch(latestBlob.url);
        const existingData = await existingRes.json();
        existingRows = existingData.rows || [];
      }
    } catch {
      // No existing data, start fresh
    }

    // Merge: existing data first (as base), then new uploads override/add on top
    const toMerge: AppsFlyerRow[][] = [];
    if (existingRows.length > 0) toMerge.push(existingRows);
    toMerge.push(...allParsed);
    const merged = mergeByAdset(toMerge);

    // Store as JSON blob
    const data = {
      rows: merged,
      uploaded_at: new Date().toISOString(),
      filenames: files.map(f => f.name),
      row_count: merged.length,
    };

    await put(`${BLOB_PREFIX}/latest.json`, JSON.stringify(data), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
    });

    return NextResponse.json({
      success: true,
      message: `Merged ${merged.length} creatives từ ${files.length} file`,
      row_count: merged.length,
      sample: merged.slice(0, 3),
    });
  } catch (error: unknown) {
    console.error('Upload error:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Upload failed' }, { status: 500 });
  }
}

/**
 * GET: Read stored AppsFlyer data
 * Tries Vercel Blob first, falls back to local JSON file
 */
export async function GET() {
  // Try Vercel Blob first
  try {
    const { blobs } = await list({ prefix: BLOB_PREFIX });

    if (blobs.length > 0) {
      const latestBlob = blobs.sort((a, b) =>
        new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
      )[0];

      const response = await fetch(latestBlob.url);
      const data = await response.json();

      return NextResponse.json({ success: true, data });
    }
  } catch (error: unknown) {
    console.warn('Blob read failed, trying local fallback:', error instanceof Error ? error.message : error);
  }

  // Fallback: read from local JSON file
  try {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.join(process.cwd(), 'src', 'data', 'appsflyer-upload.json');
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw);
      return NextResponse.json({ success: true, data, source: 'local' });
    }
  } catch (e) {
    console.warn('Local fallback also failed:', e);
  }

  return NextResponse.json({ success: true, data: null, message: 'No data uploaded yet' });
}

/**
 * DELETE: Clear stored AppsFlyer data
 */
export async function DELETE() {
  try {
    const { blobs } = await list({ prefix: BLOB_PREFIX });
    for (const blob of blobs) {
      const { del } = await import('@vercel/blob');
      await del(blob.url);
    }
    return NextResponse.json({ success: true, message: 'Data cleared' });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Clear failed' }, { status: 500 });
  }
}

/**
 * Merge multiple parsed CSV arrays by adset_name
 * Later files override columns of earlier files for same adset
 */
function mergeByAdset(allParsed: AppsFlyerRow[][]): AppsFlyerRow[] {
  const map = new Map<string, AppsFlyerRow>();

  for (const rows of allParsed) {
    for (const row of rows) {
      const key = row.adset_name.toLowerCase().trim();
      if (map.has(key)) {
        // Merge: keep existing, override with new non-zero values
        const existing = map.get(key)!;
        for (const [k, v] of Object.entries(row)) {
          if (k === 'adset_name') continue;
          // Override if new value is non-zero/non-empty
          if (v !== 0 && v !== '' && v !== undefined) {
            existing[k] = v;
          }
        }
      } else {
        map.set(key, { ...row });
      }
    }
  }

  return Array.from(map.values());
}

/**
 * Parse CSV with flexible column mapping
 */
function parseCSV(csv: string): AppsFlyerRow[] {
  const lines = csv.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if ((ch === ',' || ch === '\t') && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseRow(lines[0]);

  // Find column indices with flexible matching
  const findCol = (patterns: string[]): number => {
    return headers.findIndex(h =>
      patterns.some(p => h.toLowerCase().includes(p.toLowerCase()))
    );
  };

  const adsetCol = findCol(['adset', 'ad set', 'ad_set', 'Ad Set Name', 'Adset Name', 'ad name', 'campaign']);
  const roasD3Col = findCol(['roas d3', 'roas_d3', 'ROAS Day 3', 'roas (day 3)', 'day 3 roas', 'd3 roas']);
  const buyerD3Col = findCol(['buyer rate d3', 'buyer_rate_d3', 'Buyer Rate Day 3', 'buyer rate (day 3)', 'buyer d3', 'd3 buyer', 'buyer rate']);

  console.log(`[CSV Parse] Headers: ${headers.join(' | ')}`);
  console.log(`[CSV Parse] adset=${adsetCol}, roasD3=${roasD3Col}, buyerD3=${buyerD3Col}`);

  const rows: AppsFlyerRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseRow(lines[i]);
    if (values.length < 2) continue;

    const adsetName = adsetCol >= 0 ? values[adsetCol] : '';
    if (!adsetName || adsetName === '(none)') continue;

    const parseNum = (val: string): number => {
      if (!val) return 0;
      return parseFloat(val.replace(/[%$,]/g, '')) || 0;
    };

    const row: AppsFlyerRow = {
      adset_name: adsetName,
      roas_d3: roasD3Col >= 0 ? parseNum(values[roasD3Col]) : 0,
      buyer_rate_d3: buyerD3Col >= 0 ? parseNum(values[buyerD3Col]) : 0,
    };

    // Also store all other columns
    headers.forEach((h, idx) => {
      if (idx < values.length) {
        row[h] = values[idx];
      }
    });

    rows.push(row);
  }

  return rows;
}
