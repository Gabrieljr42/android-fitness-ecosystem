'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const app = path.resolve(__dirname, '../../main/assets/apps/nutricao');
const read = name => fs.readFileSync(path.join(app, name), 'utf8');

// Uma média semanal não pode transformar dias sem registro em refeições de 0 kcal.
const records = new Map();
const dateKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const current = dateKey(new Date());
const yesterday = new Date(); yesterday.setDate(yesterday.getDate()-1);
const past = dateKey(yesterday);
const history = {
  window: {}, Date, Math, profile: {kcal:2200}, today:()=>current, dateKey,
  DIAS:['domingo','segunda','terça','quarta','quinta','sexta','sábado'],
  MESES:['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'],
  dayTotals:d=>records.get(d)||{kcal:0,p:0,c:0,g:0},
  dayMeals:d=>records.has(d)?[{}]:[], fmt:n=>String(n),
  state:{tab:'diario'}, render(){}, setActiveDate:d=>{history.selected=d;return true;}
};
vm.createContext(history); vm.runInContext(read('views/diario.js'), history);
const main={innerHTML:''};
history.renderDiario(main);
assert(main.innerHTML.includes('— <small>kcal por dia com registro'));
assert.strictEqual((main.innerHTML.match(/: sem registro/g)||[]).length,7);
records.set(current,{kcal:2200,p:120,c:250,g:70});
history.renderDiario(main);
assert(main.innerHTML.includes('2200 <small>kcal por dia com registro'));
records.set(past,{kcal:0,p:0,c:0,g:0});
history.renderDiario(main);
assert(main.innerHTML.includes('1100 <small>kcal por dia com registro'));
assert(main.innerHTML.includes(': 0 kcal consumidas'));
records.set(current,{kcal:5500,p:200,c:300,g:100});
history.renderDiario(main);
assert(main.innerHTML.includes('5500 kcal consumidas'));
const heights=[...main.innerHTML.matchAll(/class="bar" style="height:([\d.]+)%/g)].map(m=>Number(m[1]));
assert(heights.every(n=>n>=0&&n<=100));
history.abrirDiaHistorico(past);
assert.strictEqual(history.selected,past);
assert.strictEqual(history.state.tab,'hoje');

// Preferência salva, mudança do sistema e preferência inválida na próxima abertura.
function appearance(saved) {
  const storage=new Map(saved === undefined ? [] : [['nt_theme',saved]]);
  const media={matches:false,addEventListener(type,fn){this.changed=fn;}};
  const root={dataset:{}};
  const meta={content:''};
  const context={window:{matchMedia:()=>media},document:{documentElement:root,querySelector:()=>meta,querySelectorAll:()=>[]},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)}};
  vm.createContext(context);vm.runInContext(read('appearance.js'),context);
  return {context,root,meta,media,storage};
}
const visual=appearance('light');
assert.strictEqual(visual.root.dataset.theme,'light');
visual.context.window.setNutriTheme('system');
assert.strictEqual(visual.root.dataset.theme,'dark');
visual.media.matches=true; visual.media.changed();
assert.strictEqual(visual.root.dataset.theme,'light');
visual.context.window.setNutriTheme('dark');
visual.media.changed();
assert.strictEqual(visual.root.dataset.theme,'dark');
assert.strictEqual(appearance(visual.storage.get('nt_theme')).root.dataset.theme,'dark');
assert.strictEqual(appearance('unexpected').root.dataset.theme,'dark');

// Voltar fecha o formulário; só depois volta a Hoje, mantendo o dia escolhido.
const classes=new Set();
const modal={innerHTML:'',scrollTop:0};
const backdrop={open:false,classList:{add:v=>classes.add(v),remove:v=>classes.delete(v),contains:v=>classes.has(v)},showModal(){this.open=true;},close(){this.open=false;}};
const elements={'#modal':modal,'#modalBack':backdrop,'#main':{scrollTop:100}};
const nav={window:{},state:{tab:'metas',activeDate:past},$:s=>elements[s]||null,$$:()=>[],render(){nav.renders++;},renders:0};
vm.createContext(nav);vm.runInContext(read('nav.js'),nav);
nav.openModal('<h2>Teste</h2>');
assert.strictEqual(nav.handleAppBack(),true);
assert.strictEqual(backdrop.open,false);
assert.strictEqual(nav.state.tab,'metas');
assert.strictEqual(nav.handleAppBack(),true);
assert.strictEqual(nav.state.tab,'hoje');
assert.strictEqual(nav.state.activeDate,past);
assert.strictEqual(nav.handleAppBack(),false);
assert.strictEqual(nav.renders,1);
console.log('OK: histórico sem registros, consumo zero, valores acima da meta, temas e navegação Voltar.');
