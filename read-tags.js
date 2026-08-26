const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const dir = path.join(__dirname, 'tag-data');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.xlsx'));
const filePath = path.join(dir, files[0]);

const wb = XLSX.readFile(filePath);
const ws = wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(ws, { defval: '' });

// Build mapping: extract creative code from "Mã creative" -> tag
const mapping = {};
let filledCount = 0;
data.forEach(row => {
  const code = row['Mã creative'] || '';
  const tag = row['Tag định hướng'] || '';
  if (code && tag) {
    mapping[code] = tag;
    filledCount++;
  }
});

console.log(`Total rows: ${data.length}, With tags: ${filledCount}`);

// Show unique tags
const uniqueTags = [...new Set(Object.values(mapping))].sort();
console.log(`\nUnique tags (${uniqueTags.length}):`);
uniqueTags.forEach(t => {
  const count = Object.values(mapping).filter(v => v === t).length;
  console.log(`  "${t}": ${count} creatives`);
});

// Save as JSON
const outPath = path.join(__dirname, 'src', 'lib', 'tag-data.json');
fs.writeFileSync(outPath, JSON.stringify(mapping, null, 2));
console.log(`\nSaved to: ${outPath}`);
