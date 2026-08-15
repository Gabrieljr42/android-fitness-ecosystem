/* kernel/icons.js — pictogramas SVG e mapeador de ícone por exercício */
/* ---------- ícones (pictogramas próprios, offline, sem dependência externa) ---------- */
var ICONS={
  press:'<line x1="2" y1="9" x2="22" y2="9"/><rect x="3.5" y="5" width="3" height="8" rx="1"/><rect x="17.5" y="5" width="3" height="8" rx="1"/><line x1="12" y1="9" x2="12" y2="17"/><line x1="7" y1="19" x2="17" y2="19"/>',
  fly:'<path d="M3.5 17 C4 9, 10 5.5, 12 5.7"/><path d="M20.5 17 C20 9, 14 5.5, 12 5.7"/><circle cx="12" cy="5.7" r="1.3" fill="currentColor" stroke="none"/><circle cx="3.5" cy="17" r="1.3" fill="currentColor" stroke="none"/><circle cx="20.5" cy="17" r="1.3" fill="currentColor" stroke="none"/>',
  lateral:'<line x1="12" y1="4" x2="12" y2="15"/><line x1="4" y1="9" x2="20" y2="9"/><circle cx="4" cy="9" r="1.6" fill="currentColor" stroke="none"/><circle cx="20" cy="9" r="1.6" fill="currentColor" stroke="none"/><line x1="9" y1="20" x2="15" y2="20"/>',
  triceps:'<line x1="12" y1="3" x2="12" y2="13"/><line x1="7" y1="13" x2="17" y2="13"/><line x1="12" y1="13" x2="12" y2="19"/><path d="M9 16.5 L12 19.5 L15 16.5"/>',
  curl:'<line x1="5" y1="7" x2="5" y2="20"/><line x1="9" y1="20" x2="9" y2="13"/><line x1="9" y1="13" x2="15" y2="6.3"/><circle cx="16" cy="5.3" r="1.9" fill="currentColor" stroke="none"/>',
  pulldown:'<line x1="12" y1="2" x2="12" y2="8"/><line x1="4" y1="8" x2="20" y2="8"/><line x1="4" y1="8" x2="8" y2="18"/><line x1="20" y1="8" x2="16" y2="18"/><line x1="12" y1="12" x2="12" y2="20"/>',
  row:'<line x1="15" y1="5" x2="15" y2="19"/><line x1="15" y1="10" x2="5" y2="10"/><circle cx="5" cy="10" r="1.6" fill="currentColor" stroke="none"/><path d="M10 7 L6.5 10 L10 13"/>',
  core:'<path d="M5 16 Q12 20 19 16"/><path d="M6.5 14 Q12 6 17.5 14"/><circle cx="12" cy="6" r="1.7" fill="currentColor" stroke="none"/>',
  squat:'<line x1="6" y1="8" x2="18" y2="8"/><rect x="4" y="5" width="2.6" height="6" rx="1"/><rect x="17.4" y="5" width="2.6" height="6" rx="1"/><line x1="12" y1="8" x2="12" y2="13"/><path d="M12 13 L8 20"/><path d="M12 13 L16 20"/>',
  legpress:'<rect x="17.5" y="4" width="3" height="13" rx="1"/><path d="M5 18 L11 10 L17 10"/><path d="M13.3 6.2 L16 6.2 M14.5 4.7 L16 6.2 L14.5 7.7"/>',
  hinge:'<path d="M16 3.5 L8 10"/><circle cx="17" cy="2.7" r="1.6" fill="currentColor" stroke="none"/><line x1="8" y1="10" x2="8" y2="19"/><line x1="8" y1="10" x2="4" y2="16"/><line x1="2.5" y1="16" x2="7.5" y2="16"/>',
  legext:'<line x1="6" y1="6" x2="6" y2="14"/><line x1="6" y1="14" x2="13" y2="14"/><path d="M13 14 L18.5 7.5"/><path d="M16.3 5.8 L18.7 7 L17.3 9.2"/>',
  legcurl:'<line x1="6" y1="6" x2="6" y2="14"/><line x1="6" y1="14" x2="13" y2="14"/><path d="M13 14 L17.5 18.5"/><path d="M14.3 19.6 L17.5 18.5 L16.6 15.3"/>',
  calf:'<line x1="5" y1="16.5" x2="19" y2="16.5"/><line x1="10" y1="16.5" x2="10" y2="6"/><circle cx="10" cy="5" r="1.6" fill="currentColor" stroke="none"/><path d="M13 13 L14.6 10.3 L16.2 13"/>',
  hip:'<line x1="8" y1="4" x2="8" y2="17"/><line x1="6.3" y1="17" x2="9.7" y2="17"/><line x1="16" y1="4" x2="16" y2="17"/><line x1="14.3" y1="17" x2="17.7" y2="17"/><path d="M5.5 9 L8.7 9 M7 7.5 L8.7 9 L7 10.5"/><path d="M18.5 9 L15.3 9 M17 7.5 L15.3 9 L17 10.5"/>',
  dumbbell:'<rect x="2.5" y="9" width="3" height="6" rx="1"/><rect x="18.5" y="9" width="3" height="6" rx="1"/><line x1="5.5" y1="12" x2="18.5" y2="12"/>'
};
function iconFor(name){
  var s=(name||'').toLowerCase();
  if(/(supino)/.test(s)) return 'press';
  if(/(voador|fly|crucifixo)/.test(s)) return 'fly';
  if(/(eleva[cç][aã]o lateral)/.test(s)) return 'lateral';
  if(/(tr[ií]ceps)/.test(s)) return 'triceps';
  if(/(rosca|b[íi]ceps|curl)/.test(s)) return 'curl';
  if(/(puxada|pulldown|barra fixa)/.test(s)) return 'pulldown';
  if(/(remada|serrote|row)/.test(s)) return 'row';
  if(/(abd[oô]men|abdominal|core|prancha)/.test(s)) return 'core';
  if(/(agachamento|squat)/.test(s)) return 'squat';
  if(/(leg\s*press)/.test(s)) return 'legpress';
  if(/(\bterra\b|stiff|levantamento)/.test(s)) return 'hinge';
  if(/(extensor|extens[aã]o de perna)/.test(s)) return 'legext';
  if(/(flexor)/.test(s)) return 'legcurl';
  if(/(panturr|calf)/.test(s)) return 'calf';
  if(/(adutor|abdutor)/.test(s)) return 'hip';
  return 'dumbbell';
}
function exIcon(name){
  var img=EX_FOTOS[name] || EX_FOTOS_ALIASES[canonKey(name)];
  if(img){ return '<span class="exicon exphoto"><img src="'+img+'" alt="'+esc(name)+'" loading="lazy"></span>'; }
  return '<span class="exicon"><svg viewBox="0 0 24 24">'+(ICONS[iconFor(name)]||ICONS.dumbbell)+'</svg></span>';
}
