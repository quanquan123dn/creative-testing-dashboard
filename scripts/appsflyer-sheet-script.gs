/**
 * AppsFlyer → Google Sheet Auto-Sync Script
 * 
 * SETUP:
 * 1. Tạo Google Sheet mới
 * 2. Extensions > Apps Script > Paste code này
 * 3. Chạy setupProperties() 1 lần để set token
 * 4. Chạy fetchAppsFlyerData() để test
 * 5. Chạy createDailyTrigger() để set lịch chạy hàng ngày
 * 6. File > Share > Publish to web > chọn Sheet1 > CSV > Publish
 * 7. Copy URL publish vào .env.local GOOGLE_SHEET_CSV_URL
 */

// ========== CẤU HÌNH ==========
const CONFIG = {
  APP_ID: 'com.fansipan.epic.stickman.survival.rpg.idle.game',
  CAMPAIGN_FILTER: 'Layer 2 creative test',
  SHEET_NAME: 'AppsFlyer_Data',
  LOOKBACK_DAYS: 120,
  // Token AppsFlyer (paste trực tiếp ở đây)
  TOKEN: 'eyJhbGciOiJBMjU2S1ciLCJjdHkiOiJKV1QiLCJlbmMiOiJBMjU2R0NNIiwidHlwIjoiSldUIiwiemlwIjoiREVGIn0.EVHt5vHhJixJwR-kwD3Ow_xOZFTfU4TYOwD5-_b2PomJz1Ok0S-Qkg.ox6YCZ0MiUxVmd2Z.NjY4UJBadEihn3SRKnCdKDyhIrK-XC_I9lkMbpF5Ieh72HTiqvK6Ooyuzl0gG7phs0YO70f28VPv89epx5uct_btXdBbt5ddVgMeXOtdTLls5H3cSqnGes85al_D3UGQx3nyQWpITMB0rzNmL7ZRoEPmmSQw2yBbklprISJaHdoPP2-j9tHCEwp1lKkOf5D4ywQjrVPoOOLv_LPHy7vhVWA5MsUx7LwA8sJETsp0TCXHTLsbOxyr6nd_WxiSnTx1HAJmqIUjIl6GgVmyTdr1pJwuwhbnqetY4bCEzFaha4Oy4Cx88RXMNl0anGZ-7buKGUw23V-Snqs_GBefiUAbGlRBrLQ.fW1PdknhWzW1kBjhFGEfOg',
};

/**
 * Hàm chính: Pull data từ AppsFlyer và ghi vào Sheet
 * Chạy hàm này để test, hoặc để trigger tự chạy hàng ngày
 */
function fetchAppsFlyerData() {
  const token = CONFIG.TOKEN;
  if (!token) {
    Logger.log('ERROR: Chưa điền token vào CONFIG.TOKEN!');
    return;
  }

  const sheet = getOrCreateSheet();
  
  // 1. Fetch aggregate data (installs, cost, revenue, purchasers)
  Logger.log('Fetching aggregate data...');
  const aggData = fetchAggregateData(token);
  Logger.log(`Aggregate: ${aggData.length} rows for campaign filter "${CONFIG.CAMPAIGN_FILTER}"`);
  
  // 2. Fetch cohort D3 data (ROAS D3, buyer rate D3)
  Logger.log('Fetching cohort D3 data...');
  const cohortD3 = fetchCohortD3(token);
  Logger.log(`Cohort D3: ${Object.keys(cohortD3).length} ad entries`);
  
  // 3. Merge and write to sheet
  const merged = mergeData(aggData, cohortD3);
  writeToSheet(sheet, merged);
  
  Logger.log(`Done! Wrote ${merged.length} rows to sheet.`);
}

/**
 * Fetch aggregate report từ AppsFlyer
 */
function fetchAggregateData(token) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - CONFIG.LOOKBACK_DAYS);
  
  const startStr = Utilities.formatDate(start, 'GMT', 'yyyy-MM-dd');
  const endStr = Utilities.formatDate(end, 'GMT', 'yyyy-MM-dd');
  
  const url = `https://hq1.appsflyer.com/api/agg-data/export/app/${CONFIG.APP_ID}/partners_report/v5?from=${startStr}&to=${endStr}&groupings=pid,c,af_ad`;
  
  const options = {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'accept': 'text/csv',
    },
    muteHttpExceptions: true,
  };
  
  const response = UrlFetchApp.fetch(url, options);
  if (response.getResponseCode() !== 200) {
    Logger.log(`Aggregate API error: ${response.getResponseCode()} - ${response.getContentText().substring(0, 200)}`);
    return [];
  }
  
  const csv = response.getContentText();
  const rows = parseCSV(csv);
  
  // Filter for target campaign
  return rows.filter(r => {
    const campaign = r['Campaign (c)'] || r['Campaign'] || '';
    return campaign.includes(CONFIG.CAMPAIGN_FILTER);
  });
}

/**
 * Fetch cohort D3 data từ AppsFlyer Cohort API
 */
function fetchCohortD3(token) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - CONFIG.LOOKBACK_DAYS);
  
  const startStr = Utilities.formatDate(start, 'GMT', 'yyyy-MM-dd');
  const endStr = Utilities.formatDate(end, 'GMT', 'yyyy-MM-dd');
  
  const params = [
    `from=${startStr}`,
    `to=${endStr}`,
    'groupings=pid,c,af_ad',
    'kpis=af_purchase_unique_users,users,revenue,cost',
    'cohort_type=user_acquisition',
    'cohort_day=3',
    'min_cohort_size=1',
    'per_day=false',
  ].join('&');
  
  const url = `https://hq1.appsflyer.com/api/cohorts/v1/data/app/${CONFIG.APP_ID}?${params}`;
  
  const options = {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'accept': 'application/json',
    },
    muteHttpExceptions: true,
  };
  
  try {
    const response = UrlFetchApp.fetch(url, options);
    Logger.log(`Cohort API status: ${response.getResponseCode()}`);
    
    if (response.getResponseCode() !== 200) {
      Logger.log(`Cohort API error: ${response.getContentText().substring(0, 300)}`);
      return {};
    }
    
    const json = JSON.parse(response.getContentText());
    Logger.log(`Cohort response keys: ${Object.keys(json).join(', ')}`);
    
    const result = {};
    
    // Try multiple response formats
    const data = json.data?.results || json.data || json.results || json;
    if (Array.isArray(data)) {
      data.forEach(row => {
        const adName = row.dimensions?.af_ad || row.af_ad || '';
        const campaign = row.dimensions?.c || row.c || '';
        if (!campaign.includes(CONFIG.CAMPAIGN_FILTER)) return;
        
        const purchasersD3 = row.kpis?.af_purchase_unique_users?.day_3 
          || row.af_purchase_unique_users_day_3 || 0;
        const usersD3 = row.kpis?.users?.day_3 || row.users_day_3 || 0;
        const revenueD3 = row.kpis?.revenue?.day_3 || row.revenue_day_3 || 0;
        const costD3 = row.kpis?.cost?.day_3 || row.cost_day_3 || 0;
        
        result[adName] = {
          purchasers_d3: purchasersD3,
          users_d3: usersD3,
          revenue_d3: revenueD3,
          cost_d3: costD3,
          roas_d3: costD3 > 0 ? (revenueD3 / costD3) * 100 : 0,
          buyer_rate_d3: usersD3 > 0 ? (purchasersD3 / usersD3) * 100 : 0,
        };
      });
    }
    
    return result;
  } catch (e) {
    Logger.log(`Cohort API exception: ${e.message}`);
    return {};
  }
}

/**
 * Merge aggregate + cohort data
 */
function mergeData(aggRows, cohortD3) {
  return aggRows.map(row => {
    const adName = row['Ad (af_ad)'] || row['af_ad'] || 'Unknown';
    const d3 = cohortD3[adName] || {};
    
    const installs = parseFloat(row['Installs'] || '0');
    const cost = parseFloat(row['Total Cost'] || '0');
    const revenue = parseFloat(row['Total Revenue'] || '0');
    const roi = parseFloat((row['ROI'] || '0').replace('%', '')) || 0;
    const purchasers = parseFloat(row['af_purchase (Unique users)'] || '0');
    
    // Buyer rate D3: from cohort if available, else calculate from aggregate
    const buyerRateD3 = d3.buyer_rate_d3 || (installs > 0 ? (purchasers / installs) * 100 : 0);
    // ROAS D3: from cohort if available, else use lifetime ROI as fallback
    const roasD3 = d3.roas_d3 || roi;
    
    return {
      ad_name: adName,
      campaign: row['Campaign (c)'] || row['Campaign'] || '',
      media_source: row['Media Source (pid)'] || row['pid'] || '',
      installs: installs,
      cost: cost,
      revenue: revenue,
      roi: roi,
      purchasers: purchasers,
      purchasers_d3: d3.purchasers_d3 || purchasers,
      roas_d3: roasD3,
      buyer_rate_d3: buyerRateD3,
    };
  }).filter(r => r.installs > 0 || r.cost > 0);
}

/**
 * Ghi data vào Google Sheet
 */
function writeToSheet(sheet, data) {
  // Clear existing data
  sheet.clear();
  
  // Headers
  const headers = [
    'ad_name', 'campaign', 'media_source', 
    'installs', 'cost', 'revenue', 'roi',
    'purchasers', 'purchasers_d3',
    'roas_d3', 'buyer_rate_d3',
    'last_updated'
  ];
  
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  
  if (data.length === 0) {
    Logger.log('No data to write.');
    return;
  }
  
  const now = new Date().toISOString();
  
  // Data rows
  const rows = data.map(d => [
    d.ad_name,
    d.campaign,
    d.media_source,
    d.installs,
    d.cost,
    d.revenue,
    d.roi,
    d.purchasers,
    d.purchasers_d3,
    d.roas_d3,
    d.buyer_rate_d3,
    now,
  ]);
  
  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  
  // Format numbers
  sheet.getRange(2, 4, rows.length, 1).setNumberFormat('#,##0');     // installs
  sheet.getRange(2, 5, rows.length, 2).setNumberFormat('$#,##0.00'); // cost, revenue
  sheet.getRange(2, 7, rows.length, 1).setNumberFormat('0.0"%"');    // roi
  sheet.getRange(2, 8, rows.length, 2).setNumberFormat('#,##0');     // purchasers
  sheet.getRange(2, 10, rows.length, 2).setNumberFormat('0.0"%"');   // roas_d3, buyer_rate_d3
  
  // Auto-resize columns
  for (let i = 1; i <= headers.length; i++) {
    sheet.autoResizeColumn(i);
  }
}

/**
 * Get or create the data sheet
 */
function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
  }
  return sheet;
}

/**
 * Parse CSV text into array of objects
 */
function parseCSV(csv) {
  const lines = csv.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  
  const parseRow = (line) => {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
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
  const rows = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseRow(lines[i]);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || '';
    });
    rows.push(row);
  }
  
  return rows;
}

/**
 * Tạo trigger chạy hàng ngày lúc 6h sáng (UTC+7 = 23h UTC)
 * Chạy hàm này 1 LẦN DUY NHẤT
 */
function createDailyTrigger() {
  // Xóa trigger cũ nếu có
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => {
    if (t.getHandlerFunction() === 'fetchAppsFlyerData') {
      ScriptApp.deleteTrigger(t);
    }
  });
  
  // Tạo trigger mới: chạy hàng ngày 6h sáng
  ScriptApp.newTrigger('fetchAppsFlyerData')
    .timeBased()
    .everyDays(1)
    .atHour(6)
    .create();
  
  Logger.log('Daily trigger created! Script sẽ chạy tự động lúc 6h sáng mỗi ngày.');
}

/**
 * DEBUG: Thử nhiều grouping khác nhau để xem AppsFlyer có data gì
 * Chạy hàm này để xem kết quả trong Execution Log
 */
function debugGroupings() {
  const token = CONFIG.TOKEN;
  
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - CONFIG.LOOKBACK_DAYS);
  const startStr = Utilities.formatDate(start, 'GMT', 'yyyy-MM-dd');
  const endStr = Utilities.formatDate(end, 'GMT', 'yyyy-MM-dd');
  
  const groupings = [
    'pid,c,af_ad',
    'pid,c,af_adset',
    'pid,c,af_ad_id',
    'pid,c,af_adset_id',
    'pid,c,af_adset,af_ad',
    'pid,c,af_channel,af_ad',
  ];
  
  groupings.forEach(g => {
    const url = `https://hq1.appsflyer.com/api/agg-data/export/app/${CONFIG.APP_ID}/partners_report/v5?from=${startStr}&to=${endStr}&groupings=${g}`;
    
    const response = UrlFetchApp.fetch(url, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}`, 'accept': 'text/csv' },
      muteHttpExceptions: true,
    });
    
    if (response.getResponseCode() === 200) {
      const csv = response.getContentText();
      const rows = parseCSV(csv);
      const filtered = rows.filter(r => {
        const campaign = r['Campaign (c)'] || r['Campaign'] || '';
        return campaign.includes(CONFIG.CAMPAIGN_FILTER);
      });
      
      Logger.log(`\n=== Grouping: ${g} ===`);
      Logger.log(`Total rows: ${rows.length}, Filtered (Layer 2): ${filtered.length}`);
      if (filtered.length > 0) {
        Logger.log(`Headers: ${Object.keys(filtered[0]).join(', ')}`);
        // Show first 5 rows summary
        filtered.slice(0, 10).forEach((r, i) => {
          const adName = r['Ad (af_ad)'] || r['af_ad'] || '-';
          const adset = r['Adset (af_adset)'] || r['af_adset'] || '-';
          const adId = r['Ad ID (af_ad_id)'] || r['af_ad_id'] || '-';
          const adsetId = r['Adset ID (af_adset_id)'] || r['af_adset_id'] || '-';
          const installs = r['Installs'] || '0';
          const revenue = r['Total Revenue'] || '0';
          Logger.log(`  Row ${i+1}: ad="${adName}" adset="${adset}" ad_id="${adId}" adset_id="${adsetId}" installs=${installs} revenue=${revenue}`);
        });
      }
    } else {
      Logger.log(`\n=== Grouping: ${g} === ERROR: ${response.getResponseCode()}`);
    }
  });
}
