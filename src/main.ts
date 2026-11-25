import './style.css';
import { SimClient } from './engine/SimClient';
import type { EngineSnapshot, PayrollResult } from './engine/types';
import { drawWorkshop } from './ui/workshop';
import { drawCooking } from './ui/cooking';
import { drawMonitor } from './ui/monitor';
import { drawPayroll } from './ui/payroll';
import { fmtClock, HitRegion, hit, roundRect } from './ui/drawutil';
import { COCOON_TYPES } from './engine/cocoon';

type Page = 'workshop' | 'cooking' | 'monitor' | 'payroll';
const VALID_PAGES: Page[] = ['workshop', 'cooking', 'monitor', 'payroll'];

function pageFromHash(): Page {
  const p = location.hash.replace('#/', '') as Page;
  return VALID_PAGES.includes(p) ? p : 'workshop';
}

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const client = new SimClient();

let page: Page = pageFromHash();
let snapshot: EngineSnapshot | null = null;
let payroll: PayrollResult | null = null;
let regions: HitRegion[] = [];
let selectedEnd = 0;
let paused = false;
let speed = 1.5;
let scale = 8;
let loadMenuPot: number | null = null;
let dayOverShown = false;
let hint = '';
let hintTimer = 0;

// ---------- 画布 DPI 适配 ----------
function resize(): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  render();
}
window.addEventListener('resize', resize);

// ---------- 渲染 ----------
function render(): void {
  const rect = canvas.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  regions = [];
  if (!snapshot) {
    ctx.fillStyle = '#a89578';
    ctx.font = '16px sans-serif';
    ctx.fillText('引擎启动中…', 30, 40);
    return;
  }
  if (page === 'workshop') drawWorkshop(ctx, snapshot, w, h, regions);
  else if (page === 'cooking') drawCooking(ctx, snapshot, w, h, regions);
  else if (page === 'monitor') drawMonitor(ctx, snapshot, w, h, regions, selectedEnd);
  else drawPayroll(ctx, snapshot, w, h, payroll, regions);

  if (loadMenuPot !== null) drawLoadMenu(w, h);
  updateHint();
}

function drawLoadMenu(w: number, h: number): void {
  const mw = 300;
  const mh = 190;
  const x = w / 2 - mw / 2;
  const y = h / 2 - mh / 2;
  ctx.fillStyle = 'rgba(12,9,6,0.55)';
  ctx.fillRect(0, 0, w, h);
  roundRect(ctx, x, y, mw, mh, 10);
  ctx.fillStyle = '#2a2118';
  ctx.fill();
  ctx.strokeStyle = '#d9a441';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = '#e8c270';
  ctx.font = '600 15px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`往 ${(loadMenuPot ?? 0) + 1} 号锅装生茧（一次 12 粒）`, x + 18, y + 30);

  COCOON_TYPES.forEach((t, i) => {
    const by = y + 50 + i * 40;
    regions.push({ x: x + 16, y: by, w: mw - 32, h: 32, action: 'load', payload: `${loadMenuPot}:${t.id}` });
    roundRect(ctx, x + 16, by, mw - 32, 32, 6);
    ctx.fillStyle = '#362a1d';
    ctx.fill();
    ctx.strokeStyle = '#4a3a28';
    ctx.stroke();
    ctx.fillStyle = t.color;
    ctx.beginPath();
    ctx.arc(x + 34, by + 16, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8dcc4';
    ctx.font = '12.5px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText(`${t.name}｜丝长 ${t.filamentLength}m｜定粒 ${t.targetCount}`, x + 50, by + 20);
  });
  regions.push({ x, y, w: mw, h: mh, action: 'menuSwallow' });
}

// ---------- 交互 ----------
canvas.addEventListener('click', (ev) => {
  const rect = canvas.getBoundingClientRect();
  const x = ev.clientX - rect.left;
  const y = ev.clientY - rect.top;
  if (loadMenuPot !== null) {
    const r = hit(regions, x, y);
    if (r?.action === 'load') {
      const [potId, typeId] = String(r.payload).split(':');
      client.send({ kind: 'loadCocoons', potId: Number(potId), typeId, n: 12 });
      toast(`已往 ${Number(potId) + 1} 号锅装入 12 粒生茧`, 'good');
      loadMenuPot = null;
      render();
      return;
    }
    // 点击菜单外部或遮罩：关闭菜单，不触发其他操作
    loadMenuPot = null;
    render();
    return;
  }

  const r = hit(regions, x, y);
  if (!r) return;
  switch (r.action) {
    case 'feed':
      client.send({ kind: 'feed', endId: Number(r.payload) });
      break;
    case 'tie':
      client.send({ kind: 'tie', endId: Number(r.payload) });
      break;
    case 'feedAll':
      client.send({ kind: 'feedAll' });
      toast('已向粒数不足的绪统一添绪');
      break;
    case 'select':
      selectedEnd = Number(r.payload);
      render();
      return;
    case 'tempUp':
      adjustTemp(Number(r.payload), 5);
      break;
    case 'tempDown':
      adjustTemp(Number(r.payload), -5);
      break;
    case 'brush':
      client.send({ kind: 'brush', potId: Number(r.payload) });
      toast(`${Number(r.payload) + 1} 号锅索绪（刷找丝头）`);
      break;
    case 'trim':
      client.send({ kind: 'trim', potId: Number(r.payload) });
      toast(`${Number(r.payload) + 1} 号锅理绪（剥除外层乱丝）`, 'good');
      break;
    case 'loadMenu':
      loadMenuPot = Number(r.payload);
      render();
      return;
    case 'reset':
      if (window.confirm('确定清零并重新开班吗？')) {
        client.send({ kind: 'reset' });
        payroll = null;
        dayOverShown = false;
        hideDayOver();
      }
      break;
    case 'menuSwallow':
      return;
  }
});

function adjustTemp(potId: number, delta: number): void {
  if (!snapshot) return;
  const cur = snapshot.pots[potId].targetTemp;
  client.send({ kind: 'setTemp', potId, temp: Math.min(100, Math.max(60, cur + delta)) });
}

// ---------- 顶栏控件 ----------
document.querySelectorAll<HTMLButtonElement>('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    page = btn.dataset.page as Page;
    history.replaceState(null, '', `#/${page}`);
    render();
  });
});

// 同步初始 tab 高亮与 hash
{
  const initial = document.querySelector<HTMLButtonElement>(`.tab[data-page="${page}"]`);
  if (initial) {
    document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
    initial.classList.add('active');
  }
}
window.addEventListener('hashchange', () => {
  const next = pageFromHash();
  if (next === page) return;
  page = next;
  document.querySelectorAll('.tab').forEach((b) =>
    b.classList.toggle('active', (b as HTMLElement).dataset.page === page),
  );
  render();
});

const speedInput = document.getElementById('hud-speed') as HTMLInputElement;
const speedVal = document.getElementById('hud-speed-val') as HTMLElement;
speedInput.addEventListener('input', () => {
  speed = Number(speedInput.value);
  speedVal.textContent = speed.toFixed(1);
  client.send({ kind: 'setSpeed', speed });
});
(document.getElementById('hud-scale') as HTMLSelectElement).addEventListener('change', (ev) => {
  scale = Number((ev.target as HTMLSelectElement).value);
  client.send({ kind: 'setScale', scale });
});
const pauseBtn = document.getElementById('hud-pause') as HTMLButtonElement;
pauseBtn.addEventListener('click', () => {
  paused = !paused;
  pauseBtn.textContent = paused ? '继续' : '暂停';
  client.send({ kind: 'setPaused', paused });
});

// ---------- Toast 与提示 ----------
const toastLayer = document.getElementById('toast-layer')!;
function toast(message: string, kind: '' | 'bad' | 'good' = ''): void {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = message;
  toastLayer.appendChild(el);
  window.setTimeout(() => el.remove(), 2600);
}
function updateHint(): void {
  const bar = document.getElementById('hint-bar')!;
  const hints: Record<Page, string> = {
    workshop: '盯着每绪的纤度与粒数：变橙=偏细或茧将尽，变红=断头。点绪台添绪/接绪，熟茧不足先去煮茧页。',
    cooking: '装茧→控温煮透→索绪→理绪，四步走完才进熟茧库存。欠熟刷不动、过熟出废丝，温度别贪高。',
    monitor: '单绪纤度曲线：添绪不及时会留下明显“细腰”，断头处曲线断开。右侧可看每粒茧的剩余丝层。',
    payroll: '',
  };
  if (hintTimer <= 0) hint = hints[page];
  bar.textContent = hint;
  // 工钱结算页不显示底部提示条，避免遮挡面板
  bar.style.display = hint && page !== 'payroll' ? 'block' : 'none';
}
// 切页时清掉临时告警，避免上一页的提示残留
window.addEventListener('hashchange', () => {
  hintTimer = 0;
  hint = '';
});
function flashHint(text: string, ms = 2600): void {
  hint = text;
  hintTimer = ms / 1000;
}

// ---------- 日班结束遮罩 ----------
function showDayOver(p: PayrollResult): void {
  if (dayOverShown) return;
  dayOverShown = true;
  const layer = document.createElement('div');
  layer.id = 'dayover';
  layer.innerHTML = `
    <div class="card">
      <h2>下班铃响 · 本班工钱结算</h2>
      <table>
        <tr><td>生丝产量</td><td>${p.outputMass.toFixed(1)} g</td></tr>
        <tr><td>平均纤度 / CV</td><td>${p.meanDenier.toFixed(1)} D / ${(p.cv * 100).toFixed(1)}%</td></tr>
        <tr><td>断头 / 疙瘩</td><td>${p.breaks} 次 / ${p.slubs} 个</td></tr>
        <tr><td>匀度等级</td><td>${p.grade}</td></tr>
        <tr><td>计件 + 质量奖</td><td>${(p.pieceWage + p.qualityBonus).toFixed(2)} 元</td></tr>
        <tr><td>扣罚合计</td><td>−${(p.breakPenalty + p.wastePenalty).toFixed(2)} 元</td></tr>
      </table>
      <p class="wage">应得工钱：${p.totalWage.toFixed(2)} 元</p>
      <button class="btn primary" id="dayover-close">知道了</button>
    </div>`;
  document.getElementById('stage')!.appendChild(layer);
  document.getElementById('dayover-close')!.addEventListener('click', hideDayOver);
}
function hideDayOver(): void {
  document.getElementById('dayover')?.remove();
}

// ---------- Worker 回调 ----------
client.onSnapshot((s) => {
  const prevBreaks = snapshot?.totalBreaks ?? 0;
  snapshot = s;
  document.getElementById('hud-clock')!.textContent = `时辰 ${fmtClock(s.gameTime)}`;
  document.getElementById('hud-pool')!.textContent = `熟茧 ${s.readyCocoons}`;
  document.getElementById('hud-break')!.textContent = `断头 ${s.totalBreaks}`;
  if (s.totalBreaks > prevBreaks && page !== 'workshop') {
    flashHint(`有绪断头了（累计 ${s.totalBreaks} 次），回车间页或监看页接绪！`);
  }
  if (s.readyCocoons === 0 && s.activeEnds < 40) {
    flashHint('熟茧库存为空，快去煮茧页煮茧、索绪、理绪！');
  }
  render();
});
client.onPayroll((p) => {
  payroll = p;
  showDayOver(p);
  render();
});

// ---------- 主循环：每帧向 Worker 发 tick（Worker 内部按倍速推进） ----------
let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!paused) client.send({ kind: 'tick', dtReal: dt });
  if (hintTimer > 0) {
    hintTimer -= dt;
    if (hintTimer <= 0) render();
  }
  requestAnimationFrame(frame);
}

resize();
requestAnimationFrame(frame);
