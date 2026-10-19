'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const source = fs.readFileSync(path.join(__dirname, '../../main/assets/apps/nutricao/launch.js'), 'utf8');
function launch({native=false, reduced=false}={}) {
  let time=0, next=0;
  const timers=new Map();
  const app={inert:false,setAttribute(){},focus(){}};
  const button={focus(){}};
  const overlay={setAttribute(){},classList:{add(){}},querySelector:()=>button,addEventListener(){},contains:()=>false,focus(){},remove(){this.removed=true;}};
  const doc={body:{appendChild(){doc.shown=true;}},createElement:()=>overlay,getElementById:()=>app,addEventListener(type,fn){doc.ready=fn;}};
  const bridge={hasNativeLaunchAnimation:()=>native};
  const ctx={document:doc,window:{matchMedia:()=>({matches:reduced}),AndroidBridge:bridge},AndroidBridge:bridge,Date:{now:()=>time},setTimeout(fn,ms){const id=++next;timers.set(id,{fn,at:time+ms});return id;},clearTimeout:id=>timers.delete(id)};
  vm.runInNewContext(source,ctx);
  function tick(ms){const end=time+ms; for(;;){const entry=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!entry)break;time=entry[1].at;timers.delete(entry[0]);entry[1].fn();}time=end;}
  return {doc,app,overlay,button,tick};
}
let h=launch(); h.doc.ready();
assert(h.app.inert); h.tick(1200);
assert(h.overlay.removed); assert(!h.app.inert);
h=launch(); h.tick(3200); // DOMContentLoaded nunca chega: a abertura não pode prender o app.
assert(h.overlay.removed); h.doc.ready(); assert(!h.app.inert);
h=launch(); h.doc.ready(); h.button.onclick(); h.tick(200);
assert(h.overlay.removed); assert(!h.app.inert);
h=launch({reduced:true}); h.doc.ready(); h.tick(0);
assert(h.overlay.removed); assert(!h.app.inert);
h=launch({native:true}); assert(!h.doc.shown); // Sem duas aberturas no Android 12+.
console.log('Abertura: conclusão, escape, timeout, movimento reduzido e splash nativa OK.');
