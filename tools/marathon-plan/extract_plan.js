'use strict';
/* Extrai todas as planilhas do xlsx (sem dependências) para JSON de inspeção.
   Uso: descartável/one-shot — extrai de um diretório temporário com o xlsx
   descompactado (ver constante X abaixo) e grava maratona_plan_raw.json
   ao lado deste script. Uso histórico: node tools/marathon-plan/extract_plan.js */
const fs = require('fs');
const path = require('path');

const X = 'C:/Users/gabri/AppData/Local/Temp/opencode/maratona_x/x';
const xml = p => fs.readFileSync(path.join(X, p), 'utf8');

// ---- sharedStrings ----
const shared = [];
{
  const ssXml = xml('xl/sharedStrings.xml');
  const re = /<(?:\w+:)?si>([\s\S]*?)<\/(?:\w+:)?si>/g; let m;
  while ((m = re.exec(ssXml))) {
    const texts = [];
    const tre = /<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g; let t;
    while ((t = tre.exec(m[1]))) texts.push(t[1]);
    shared.push(texts.join(''));
  }
}
const dec = s => String(s == null ? '' : s)
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
  .replace(/&amp;/g, '&');

// ---- workbook ----
const wbXml = xml('xl/workbook.xml');
const relsXml = xml('xl/_rels/workbook.xml.rels');

const relMap = {};
{
  const re = /<(?:\w+:)?Relationship\b([^>]*)\/?>/g; let m;
  while ((m = re.exec(relsXml))) {
    const a = m[1];
    if (!/relationships\/worksheet"/.test(a)) continue;
    const idM = a.match(/Id="([^"]+)"/);
    const tgM = a.match(/Target="[^"]*?(sheet\d+\.xml)"/);
    if (idM && tgM) relMap[idM[1]] = tgM[1];
  }
}

const sheetOrder = [];
{
  const re = /<(?:\w+:)?sheet\b([^>]*)\/?>/g; let m;
  while ((m = re.exec(wbXml))) {
    const a = m[1];
    const nm = a.match(/name="([^"]*)"/);
    const rid = a.match(/r:id="([^"]+)"/);
    if (nm && rid && relMap[rid[1]]) sheetOrder.push({ name: dec(nm[1]), file: relMap[rid[1]] });
  }
}

// ---- células ----
function colToNum(ref) {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

function parseSheet(file) {
  const sx = xml('xl/worksheets/' + file);
  const rows = [];
  const rowRe = /<(?:\w+:)?row\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?row>/g; let rm;
  while ((rm = rowRe.exec(sx))) {
    const rowNum = +(rm[1].match(/r="(\d+)"/) || [0, rows.length + 1])[1];
    const cells = {};
    const cRe = /<(?:\w+:)?c\b([^>]*?)\/>|<(?:\w+:)?c\b([^>]*?)>([\s\S]*?)<\/(?:\w+:)?c>/g; let cm;
    while ((cm = cRe.exec(rm[2]))) {
      const attrs = cm[1] || cm[2] || '';
      const inner = cm[3] || '';
      const refM = attrs.match(/r="([A-Z]+)\d+"/);
      if (!refM) continue;
      const col = colToNum(refM[1]);
      const typeM = attrs.match(/t="([^"]+)"/);
      const vM = inner.match(/<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/);
      const isM = inner.match(/<(?:\w+:)?is>([\s\S]*?)<\/(?:\w+:)?is>/);
      let val = null;
      if (typeM && typeM[1] === 's' && vM) val = dec(shared[+vM[1]]);
      else if (typeM && typeM[1] === 'inlineStr' && isM) {
        const parts = [];
        const tre = /<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g; let t;
        while ((t = tre.exec(isM[1]))) parts.push(dec(t[1]));
        val = parts.join('');
      } else if (typeM && typeM[1] === 'str' && vM) val = dec(vM[1]);
      else if (vM) { const raw = vM[1]; val = /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : dec(raw); }
      cells[col] = val;
    }
    rows[rowNum] = cells;
  }
  return rows.map((cells, i) => ({ row: i + 1, cells }));
}

const out = {};
for (const sh of sheetOrder) {
  const parsed = parseSheet(sh.file);
  const table = parsed.map(({ row, cells }) => {
    const maxCol = Math.max(0, ...Object.keys(cells).map(Number));
    const arr = [];
    for (let i = 1; i <= maxCol; i++) arr.push(cells[i] !== undefined ? cells[i] : null);
    return { row, cells: arr };
  });
  out[sh.name] = table;
}
fs.writeFileSync(path.resolve(__dirname, 'maratona_plan_raw.json'), JSON.stringify(out, null, 1), 'utf8');
console.log('Abas:', sheetOrder.map(s => s.name).join(' | '));
for (const [name, table] of Object.entries(out)) console.log(`- ${name}: ${table.length} linhas`);
