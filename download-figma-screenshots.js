#!/usr/bin/env node
// Download Figma screenshots for portfolio cards
// Usage: FIGMA_TOKEN=your_token node download-figma-screenshots.js
//
// Get your personal access token at: https://www.figma.com/developers/api#access-tokens

const https = require('https');
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.FIGMA_TOKEN;
if (!TOKEN) {
  console.error('Error: set FIGMA_TOKEN env var');
  console.error('  export FIGMA_TOKEN=your_personal_access_token');
  process.exit(1);
}

const projects = [
  { fileKey: '8BntauUJHbA7QAvVumjqia', nodeId: '1854-28258', out: 'assets/project-gabizon.png' },
  { fileKey: 'ygK5Cuvqf3nYS3rHLNHCIB', nodeId: '7904-4313',  out: 'assets/project-mecomics.png' },
  { fileKey: 'yBA8uYUSPB5TZMaooumsIb', nodeId: '4-29',        out: 'assets/project-snipcritics.png' },
  { fileKey: 't8WovX6tWNb3bE7OKZBCDc', nodeId: '0-1',         out: 'assets/project-illustration.png' },
];

function get(url, headers) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
      res.on('error', reject);
    });
  });
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => { fs.writeFileSync(dest, Buffer.concat(chunks)); resolve(); });
      res.on('error', reject);
    });
  });
}

async function main() {
  for (const { fileKey, nodeId, out } of projects) {
    const apiUrl = `https://api.figma.com/v1/images/${fileKey}?ids=${nodeId}&format=png&scale=2`;
    console.log(`Fetching export URL for ${path.basename(out)}...`);
    const { status, body } = await get(apiUrl, { 'X-Figma-Token': TOKEN });
    if (status !== 200) { console.error(`  Error ${status}: ${body}`); continue; }
    const data = JSON.parse(body);
    const imgUrl = data.images?.[nodeId.replace('-', ':')];
    if (!imgUrl) { console.error(`  No image URL returned`); continue; }
    console.log(`  Downloading...`);
    await download(imgUrl, out);
    console.log(`  Saved → ${out}`);
  }
  console.log('\nDone! Reload the portfolio to see the screenshots.');
}

main().catch(console.error);
