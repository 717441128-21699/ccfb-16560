import type { EngineSnapshot } from '../engine/types';
import { TARGET_BAND_HIGH, TARGET_BAND_LOW } from '../engine/cocoon';

export interface HitRegion {
  x: number;
  y: number;
  w: number;
  h: number;
  action: string;
  payload?: number | string;
  label?: string;
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function hit(regions: HitRegion[], x: number, y: number): HitRegion | null {
  // 后绘制的在上层，倒序检测
  for (let i = regions.length - 1; i >= 0; i--) {
    const r = regions[i];
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r;
  }
  return null;
}

export function statusColor(warnLevel: number, broken: boolean, idle: boolean): string {
  if (broken) return '#c85a4a';
  if (idle) return '#7a6a55';
  switch (warnLevel) {
    case 2:
      return '#d97f3a';
    case 1:
      return '#d9c041';
    default:
      return '#7fae5a';
  }
}

export function denierColor(d: number): string {
  if (d <= 0) return '#7a6a55';
  if (d < TARGET_BAND_LOW) return '#d97f3a';
  if (d > TARGET_BAND_HIGH) return '#c9a24a';
  return '#9fc27a';
}

export function fmtClock(gameTime: number): string {
  // 班次从早上 6:00 开始
  const totalMin = Math.floor(gameTime / 60) + 6 * 60;
  const h = Math.floor(totalMin / 60) % 24;
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function drawTargetBand(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  minD: number,
  maxD: number,
): void {
  const yOf = (d: number) => y + h - ((d - minD) / (maxD - minD)) * h;
  const yLow = yOf(TARGET_BAND_LOW);
  const yHigh = yOf(TARGET_BAND_HIGH);
  ctx.fillStyle = 'rgba(127,174,90,0.14)';
  ctx.fillRect(x, yHigh, w, yLow - yHigh);
  ctx.strokeStyle = 'rgba(127,174,90,0.55)';
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, yLow);
  ctx.lineTo(x + w, yLow);
  ctx.moveTo(x, yHigh);
  ctx.lineTo(x + w, yHigh);
  ctx.stroke();
  ctx.setLineDash([]);
}

export function drawPanelTitle(ctx: CanvasRenderingContext2D, title: string, w: number): void {
  ctx.fillStyle = '#e8c270';
  ctx.font = '600 16px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(title, 18, 30);
  ctx.strokeStyle = '#4a3a28';
  ctx.beginPath();
  ctx.moveTo(18, 40);
  ctx.lineTo(w - 18, 40);
  ctx.stroke();
}

export function snapshotKpi(s: EngineSnapshot): { label: string; value: string; color: string }[] {
  return [
    { label: '在缫绪数', value: `${s.activeEnds}/40`, color: '#e8c270' },
    { label: '熟茧库存', value: `${s.readyCocoons} 粒`, color: '#9fc27a' },
    { label: '累计出丝', value: `${s.totalOutput.toFixed(0)} g`, color: '#f2ead6' },
    { label: '平均纤度', value: s.meanDenier ? `${s.meanDenier.toFixed(1)} D` : '—', color: '#9fc27a' },
    { label: '纤度CV', value: `${(s.denierCV * 100).toFixed(1)}%`, color: s.denierCV < 0.1 ? '#9fc27a' : '#d97f3a' },
    { label: '断头', value: `${s.totalBreaks} 次`, color: s.totalBreaks > 80 ? '#c85a4a' : '#e8c270' },
    { label: '疙瘩', value: `${s.totalSlubs} 个`, color: '#d9a441' },
    { label: '废丝', value: `${s.totalWaste.toFixed(1)} g`, color: '#a89578' },
  ];
}
