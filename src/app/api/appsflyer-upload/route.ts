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
 * POST: Upload CSV data
 * Parses CSV, stores as JSON in Vercel Blob
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
    }

    const csv = await file.text();
    const parsed = parseCSV(csv);
    
    if (parsed.length === 0) {
      return NextResponse.json({ success: false, error: 'No data found in CSV' }, { status: 400 });
    }

    // Store as JSON blob
    const data = {
      rows: parsed,
      uploaded_at: new Date().toISOString(),
      filename: file.name,
      row_count: parsed.length,
    };

    const blob = await put(`${BLOB_PREFIX}/latest.json`, JSON.stringify(data), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
    });

    return NextResponse.json({
      success: true,
      message: `Uploaded ${parsed.length} rows`,
      url: blob.url,
      columns: parsed.length > 0 ? Object.keys(parsed[0]) : [],
      sample: parsed.slice(0, 3),
    });
  } catch (error: unknown) {
    console.error('Upload error:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Upload failed' }, { status: 500 });
  }
}

/**
 * GET: Read stored AppsFlyer data
 */
export async function GET() {
  try {
    const { blobs } = await list({ prefix: BLOB_PREFIX });
    
    if (blobs.length === 0) {
      return NextResponse.json({ success: true, data: null, message: 'No data uploaded yet' });
    }

    // Get the latest blob
    const latestBlob = blobs.sort((a, b) => 
      new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    )[0];

    const response = await fetch(latestBlob.url);
    const data = await response.json();

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    console.error('Read error:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Read failed' }, { status: 500 });
  }
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
  
  const adsetCol = findCol(['adset', 'ad set', 'ad_set', 'Ad Set Name', 'Adset Name']);
  const roasD3Col = findCol(['roas d3', 'roas_d3', 'ROAS Day 3', 'roas (day 3)']);
  const buyerD3Col = findCol(['buyer rate d3', 'buyer_rate_d3', 'Buyer Rate Day 3', 'buyer rate (day 3)', 'buyer d3']);
  
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
