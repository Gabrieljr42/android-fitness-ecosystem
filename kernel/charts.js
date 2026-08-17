/* ==========================================================================
   KERNEL CHARTS — High-Contrast Monochromatic SVG Data Visualizations
   ========================================================================== */

if (typeof gid === 'undefined') {
  var gid = 0;
}

function fmtPaceValue(sec) {
  if (!isFinite(sec) || sec <= 0) return '0:00';
  sec = Math.round(sec);
  var m = Math.floor(sec / 60);
  var s = sec % 60;
  return m + ':' + String(s).padStart(2, '0');
}

function chartSVG(pts, color) {
  if (!pts || pts.length < 2) {
    return '<div class="empty"><div class="big">📈</div><div class="s">Registre pelo menos 2 treinos pra ver a curva.</div></div>';
  }
  var lineColor = color || '#ffffff';
  var W = 340, H = 158, PL = 30, PB = 20, PT = 10, PR = 8;
  gid++;
  
  var ys = pts.map(function(p) { return Number(p.y) || 0; });
  var min = Math.min.apply(null, ys);
  var max = Math.max.apply(null, ys);
  
  if (min === max) {
    min = min > 0 ? min * 0.9 : min - 1;
    max = max > 0 ? max * 1.1 : max + 1;
  }
  
  var pad = (max - min) * 0.14;
  var lo = min - pad;
  var hi = max + pad;
  
  function X(i) {
    return PL + i * (W - PL - PR) / (pts.length - 1);
  }
  
  function Y(v) {
    return H - PB - (v - lo) * (H - PB - PT) / (hi - lo);
  }
  
  var pl = pts.map(function(p, i) {
    return X(i).toFixed(1) + ',' + Y(Number(p.y) || 0).toFixed(1);
  }).join(' ');
  
  var area = 'M' + X(0).toFixed(1) + ',' + (H - PB) + ' L' + pl.replace(/ /g, ' L') + ' L' + X(pts.length - 1).toFixed(1) + ',' + (H - PB) + ' Z';
  
  var dots = pts.map(function(p, i) {
    return '<circle cx="' + X(i).toFixed(1) + '" cy="' + Y(Number(p.y) || 0).toFixed(1) + '" r="3.2" fill="' + lineColor + '"/>';
  }).join('');
  
  var maxLabel = typeof nkg === 'function' ? nkg(max) : max.toFixed(1);
  var minLabel = typeof nkg === 'function' ? nkg(min) : min.toFixed(1);
  var firstDate = typeof fmtBR === 'function' ? fmtBR(pts[0].x) : pts[0].x;
  var lastDate = typeof fmtBR === 'function' ? fmtBR(pts[pts.length - 1].x) : pts[pts.length - 1].x;
  
  return '<svg viewBox="0 0 ' + W + ' ' + H + '">' +
    '<defs><linearGradient id="g' + gid + '" x1="0" x2="0" y1="0" y2="1">' +
    '<stop offset="0" stop-color="' + lineColor + '" stop-opacity="0.14"/>' +
    '<stop offset="1" stop-color="' + lineColor + '" stop-opacity="0.00"/>' +
    '</linearGradient></defs>' +
    '<text x="3" y="' + (PT + 8) + '" font-size="9" fill="#71717a" font-family="-apple-system, sans-serif" font-weight="600">' + maxLabel + '</text>' +
    '<text x="3" y="' + (H - PB) + '" font-size="9" fill="#71717a" font-family="-apple-system, sans-serif" font-weight="600">' + minLabel + '</text>' +
    '<line x1="' + PL + '" y1="' + (H - PB) + '" x2="' + (W - PR) + '" y2="' + (H - PB) + '" stroke="#27272a" stroke-width="1"/>' +
    '<line x1="' + PL + '" y1="' + (PT + 4) + '" x2="' + (W - PR) + '" y2="' + (PT + 4) + '" stroke="#27272a" stroke-width="1" stroke-dasharray="2 3" opacity="0.6"/>' +
    '<path d="' + area + '" fill="url(#g' + gid + ')"/>' +
    '<polyline points="' + pl + '" fill="none" stroke="' + lineColor + '" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>' +
    dots +
    '<text x="' + PL + '" y="' + (H - 5) + '" font-size="9" fill="#71717a" font-family="-apple-system, sans-serif" font-weight="600">' + firstDate + '</text>' +
    '<text x="' + (W - PR) + '" y="' + (H - 5) + '" font-size="9" fill="#71717a" font-family="-apple-system, sans-serif" font-weight="600" text-anchor="end">' + lastDate + '</text>' +
    '</svg>';
}

function paceChartSVG(pts, color) {
  if (!pts || pts.length < 2) {
    return '<div class="empty"><div class="big">📈</div><div class="s">Registre pelo menos 2 corridas pra ver a evolução do ritmo.</div></div>';
  }
  var lineColor = color || '#ffffff';
  var W = 340, H = 158, PL = 38, PB = 20, PT = 10, PR = 8;
  gid++;
  
  var ys = pts.map(function(p) { return Number(p.y) || 0; });
  var min = Math.min.apply(null, ys);
  var max = Math.max.apply(null, ys);
  
  if (min === max) {
    min = Math.max(0, min - 15);
    max += 15;
  }
  
  var pad = (max - min) * 0.14;
  var lo = Math.max(0, min - pad);
  var hi = max + pad;
  
  function X(i) {
    return PL + i * (W - PL - PR) / (pts.length - 1);
  }
  
  // Inverted mapping for Pace: lower pace seconds (faster) rendered higher (lower Y in SVG)
  function Y(v) {
    return PT + (v - lo) * (H - PB - PT) / (hi - lo);
  }
  
  var pl = pts.map(function(p, i) {
    return X(i).toFixed(1) + ',' + Y(Number(p.y) || 0).toFixed(1);
  }).join(' ');
  
  var area = 'M' + X(0).toFixed(1) + ',' + (H - PB) + ' L' + pl.replace(/ /g, ' L') + ' L' + X(pts.length - 1).toFixed(1) + ',' + (H - PB) + ' Z';
  
  var dots = pts.map(function(p, i) {
    return '<circle cx="' + X(i).toFixed(1) + '" cy="' + Y(Number(p.y) || 0).toFixed(1) + '" r="3.2" fill="' + lineColor + '"/>';
  }).join('');
  
  var firstDate = typeof fmtBR === 'function' ? fmtBR(pts[0].x) : pts[0].x;
  var lastDate = typeof fmtBR === 'function' ? fmtBR(pts[pts.length - 1].x) : pts[pts.length - 1].x;
  
  return '<svg viewBox="0 0 ' + W + ' ' + H + '">' +
    '<defs><linearGradient id="g' + gid + '" x1="0" x2="0" y1="0" y2="1">' +
    '<stop offset="0" stop-color="' + lineColor + '" stop-opacity="0.14"/>' +
    '<stop offset="1" stop-color="' + lineColor + '" stop-opacity="0.00"/>' +
    '</linearGradient></defs>' +
    '<text x="3" y="' + (PT + 8) + '" font-size="9" fill="#71717a" font-family="-apple-system, sans-serif" font-weight="600">' + fmtPaceValue(min) + '</text>' +
    '<text x="3" y="' + (H - PB) + '" font-size="9" fill="#71717a" font-family="-apple-system, sans-serif" font-weight="600">' + fmtPaceValue(max) + '</text>' +
    '<line x1="' + PL + '" y1="' + (H - PB) + '" x2="' + (W - PR) + '" y2="' + (H - PB) + '" stroke="#27272a" stroke-width="1"/>' +
    '<line x1="' + PL + '" y1="' + (PT + 4) + '" x2="' + (W - PR) + '" y2="' + (PT + 4) + '" stroke="#27272a" stroke-width="1" stroke-dasharray="2 3" opacity="0.6"/>' +
    '<path d="' + area + '" fill="url(#g' + gid + ')"/>' +
    '<polyline points="' + pl + '" fill="none" stroke="' + lineColor + '" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>' +
    dots +
    '<text x="' + PL + '" y="' + (H - 5) + '" font-size="9" fill="#71717a" font-family="-apple-system, sans-serif" font-weight="600">' + firstDate + '</text>' +
    '<text x="' + (W - PR) + '" y="' + (H - 5) + '" font-size="9" fill="#71717a" font-family="-apple-system, sans-serif" font-weight="600" text-anchor="end">' + lastDate + '</text>' +
    '</svg>';
}

function sparklineSVG(pts, color, w, h) {
  if (!pts || pts.length < 2) return '';
  var lineColor = color || '#ffffff';
  var W = w || 100, H = h || 32, pad = 2;
  var ys = pts.map(function(p) { return Number(p.y != null ? p.y : p) || 0; });
  var min = Math.min.apply(null, ys);
  var max = Math.max.apply(null, ys);
  if (min === max) { min -= 1; max += 1; }
  
  function X(i) { return pad + i * (W - 2 * pad) / (pts.length - 1); }
  function Y(v) { return H - pad - (v - min) * (H - 2 * pad) / (max - min); }
  
  var pl = ys.map(function(v, i) { return X(i).toFixed(1) + ',' + Y(v).toFixed(1); }).join(' ');
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" style="display:inline-block;vertical-align:middle;">' +
    '<polyline points="' + pl + '" fill="none" stroke="' + lineColor + '" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>' +
    '</svg>';
}
