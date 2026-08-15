/* kernel/charts.js — gráficos SVG */
/* ---------- chart ---------- */
function chartSVG(pts, color){
  if(pts.length<2) return '<div class="empty"><div class="big">📈</div><div class="s">Registre pelo menos 2 treinos pra ver a curva.</div></div>';
  var W=340,H=158,PL=30,PB=20,PT=10,PR=8; gid++;
  var ys=pts.map(function(p){return p.y;}), min=Math.min.apply(null,ys), max=Math.max.apply(null,ys);
  if(min===max){ min-=1; max+=1; }
  var pad=(max-min)*0.14, lo=min-pad, hi=max+pad;
  function X(i){ return PL + i*(W-PL-PR)/(pts.length-1); }
  function Y(v){ return H-PB - (v-lo)*(H-PB-PT)/(hi-lo); }
  var pl=pts.map(function(p,i){ return X(i).toFixed(1)+','+Y(p.y).toFixed(1); }).join(' ');
  var area='M'+X(0).toFixed(1)+','+(H-PB)+' L'+pl.replace(/ /g,' L')+' L'+X(pts.length-1).toFixed(1)+','+(H-PB)+' Z';
  var dots=pts.map(function(p,i){ return '<circle cx="'+X(i).toFixed(1)+'" cy="'+Y(p.y).toFixed(1)+'" r="3.2" fill="'+color+'"/>'; }).join('');
  return '<svg viewBox="0 0 '+W+' '+H+'"><defs><linearGradient id="g'+gid+'" x1="0" x2="0" y1="0" y2="1">'+
    '<stop offset="0" stop-color="'+color+'" stop-opacity="0.28"/><stop offset="1" stop-color="'+color+'" stop-opacity="0"/></linearGradient></defs>'+
    '<text x="3" y="'+(PT+8)+'" font-size="9" fill="#8a95a6">'+nkg(max)+'</text>'+
    '<text x="3" y="'+(H-PB)+'" font-size="9" fill="#8a95a6">'+nkg(min)+'</text>'+
    '<line x1="'+PL+'" y1="'+(H-PB)+'" x2="'+(W-PR)+'" y2="'+(H-PB)+'" stroke="#28313f"/>'+
    '<path d="'+area+'" fill="url(#g'+gid+')"/>'+
    '<polyline points="'+pl+'" fill="none" stroke="'+color+'" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>'+dots+
    '<text x="'+PL+'" y="'+(H-5)+'" font-size="9" fill="#8a95a6">'+fmtBR(pts[0].x)+'</text>'+
    '<text x="'+(W-PR)+'" y="'+(H-5)+'" font-size="9" fill="#8a95a6" text-anchor="end">'+fmtBR(pts[pts.length-1].x)+'</text></svg>';
}
