import fs from 'fs';

const env = fs.readFileSync('.env.local', 'utf8');
env.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    process.env[match[1]] = match[2]?.replace('\r', '');
  }
});

async function test() {
  const AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID!;
  const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN!;
  
  const res = await fetch(`https://graph.facebook.com/v19.0/act_${AD_ACCOUNT_ID}/campaigns?fields=id,name,status&limit=200&access_token=${META_ACCESS_TOKEN}`);
  const data = await res.json();
  const campaigns = data.data || [];
  
  // Find all "Layer 2" campaigns
  const l2Camps = campaigns.filter((c: any) => c.name.includes('Layer 2'));
  
  for (const c of l2Camps) {
    const r = await fetch(`https://graph.facebook.com/v19.0/${c.id}/ads?fields=id,name,status&limit=200&access_token=${META_ACCESS_TOKEN}`);
    const d = await r.json();
    console.log(`\nCampaign: ${c.name}`);
    console.log(`Total Ads: ${d.data?.length || 0}`);
    if (d.data?.length > 0) {
      console.log(`First 5 ads:`, d.data.slice(0,5).map((a:any)=>a.name));
      console.log(`Is VE0556 present?`, d.data.some((a:any)=>a.name.includes('VE0556')));
    }
  }
}

test();
