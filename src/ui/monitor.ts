import { cocoonType, TARGET_BAND_HIGH, TARGET_BAND_LOW } from '../engine/cocoon';
import type { EndSnapshot, EngineSnapshot } from '../engine/types';
import {
  denierColor,
  drawPanelTitle,
  drawTargetBand,
  fmtClock,
  HitRegion,
  roundRect,
  statusColor,
} from './drawutil';

const MIN_D = 4;
const MAX_D = 26;

export function drawMonitor(
  ctx: CanvasRenderingContext2D,
  s: EngineSnapshot,
  w: number,
  h: number,
  regions: HitRegion[],
  selected: number,
): void {
  ctx.clearRect(0, 0, w, h);
  drawPanelTitle(ctx, `单绪监看 · ${fmtClock(s.gameTime)}（点击上方绪号切换）`, w);

  // 绪号选择条（40 个小按钮，两排）
  const selTop = 50;
  const sw = (w - 36 - 19 * 4) / 20;
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 20; col++) {
      const idx = row * 20 + col;
      const end = s.ends[idx];
      const x = 18 + col * (sw + 4);
      const y = selTop + row * 24;
      const isSel = idx === selected;
      roundRect(ctx, x, y, sw, 20, 4);
      ctx.fillStyle = isSel ? '#5a4322' : '#2c2218';
      ctx.fill();
      ctx.strokeStyle = isSel ? '#e8c270' : statusColor(end.warnLevel, end.broken, end.idle);
      ctx.lineWidth = isSel ? 2 : 1;
      ctx.stroke();
      ctx.fillStyle = isSel ? '#e8c270' : '#a89578';
      ctx.font = '10.5px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${idx + 1}`, x + sw / 2, y + 14);
      regions.push({ x, y, w: sw, h: 20, action: 'select', payload: idx });
    }
  }

  const end = s.ends[selected];
  const panelTop = 106;

  // 左侧：纤度历史曲线
  const chartX = 24;
  const chartY = panelTop + 10;
  const chartW = w * 0.62;
  const chartH = h - panelTop - 40;
  roundRect(ctx, chartX - 8, chartY - 8, chartW + 16, chartH + 16, 8);
  ctx.fillStyle = '#241c13';
  ctx.fill();
  ctx.strokeStyle = '#4a3a28';
  ctx.stroke();

  ctx.fillStyle = '#a89578';
  ctx.font = '12.5px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`第 ${selected + 1} 绪 · 生丝纤度曲线（每点间隔 4 游戏秒，绿带为目标 ${TARGET_BAND_LOW}~${TARGET_BAND_HIGH} D）`, chartX, chartY + 4);

  const plotX = chartX + 34;
  const plotY = chartY + 18;
  const plotW = chartW - 44;
  const plotH = chartH - 44;
  // 网格
  ctx.strokeStyle = 'rgba(74,58,40,0.6)';
  ctx.lineWidth = 1;
  ctx.font = '10px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillStyle = '#7a6a55';
  for (let d = 4; d <= MAX_D; d += 2) {
    const yy = plotY + plotH - ((d - MIN_D) / (MAX_D - MIN_D)) * plotH;
    ctx.beginPath();
    ctx.moveTo(plotX, yy);
    ctx.lineTo(plotX + plotW, yy);
    ctx.stroke();
    ctx.textAlign = 'right';
    ctx.fillText(`${d}D`, plotX - 5, yy + 3);
  }
  drawTargetBand(ctx, plotX, plotY, plotW, plotH, MIN_D, MAX_D);

  // 曲线（NaN 段断开）
  const hist = end.history;
  const n = hist.length;
  if (n > 1) {
    ctx.strokeStyle = '#f2ead6';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    let pen = false;
    for (let i = 0; i < n; i++) {
      const v = hist[i];
      const xx = plotX + (i / (n - 1)) * plotW;
      if (Number.isNaN(v)) {
        pen = false;
        continue;
      }
      const clamped = Math.max(MIN_D, Math.min(MAX_D, v));
      const yy = plotY + plotH - ((clamped - MIN_D) / (MAX_D - MIN_D)) * plotH;
      if (!pen) {
        ctx.moveTo(xx, yy);
        pen = true;
      } else {
        ctx.lineTo(xx, yy);
      }
    }
    ctx.stroke();
    // 当前点
    if (!Number.isNaN(hist[n - 1])) {
      const lastX = plotX + plotW;
      const lastClamped = Math.max(MIN_D, Math.min(MAX_D, hist[n - 1]));
      const lastY = plotY + plotH - ((lastClamped - MIN_D) / (MAX_D - MIN_D)) * plotH;
      ctx.fillStyle = denierColor(hist[n - 1]);
      ctx.beginPath();
      ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    ctx.fillStyle = '#7a6a55';
    ctx.textAlign = 'center';
    ctx.fillText('尚无缫丝记录', plotX + plotW / 2, plotY + plotH / 2);
  }
  // 横轴时间标注
  ctx.fillStyle = '#7a6a55';
  ctx.textAlign = 'left';
  ctx.fillText('← 较早', plotX, plotY + plotH + 16);
  ctx.textAlign = 'right';
  ctx.fillText('当前 →', plotX + plotW, plotY + plotH + 16);

  // 右侧：该绪详情
  const rx = chartX + chartW + 24;
  const rw = w - rx - 20;
  roundRect(ctx, rx, chartY - 8, rw, chartH + 16, 8);
  ctx.fillStyle = '#241c13';
  ctx.fill();
  ctx.strokeStyle = '#4a3a28';
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.font = '600 14px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillStyle = statusColor(end.warnLevel, end.broken, end.idle);
  const stateText = end.broken ? '● 断头中 — 点击下方接绪' : end.idle ? '● 空绪 — 点击下方添绪起绪' : '● 在缫';
  ctx.fillText(stateText, rx + 14, chartY + 14);

  const rows: [string, string, string][] = [
    ['当前纤度', end.denier > 0 ? `${end.denier.toFixed(2)} D` : '—', denierColor(end.denier)],
    ['在缫茧数', `${end.count} 粒`, '#e8dcc4'],
    ['本绪出丝', `${end.outputMass.toFixed(1)} g`, '#f2ead6'],
    ['断头次数', `${end.breaks} 次`, end.breaks > 6 ? '#c85a4a' : '#e8c270'],
    ['疙瘩数', `${end.slubs} 个`, '#d9a441'],
    ['偏细时长', `${end.thinTime.toFixed(0)} 秒`, '#d97f3a'],
    ['废丝', `${end.wasteMass.toFixed(2)} g`, '#a89578'],
  ];
  ctx.font = '12.5px "PingFang SC","Microsoft YaHei",sans-serif';
  rows.forEach(([k, v, c], i) => {
    const yy = chartY + 44 + i * 26;
    ctx.fillStyle = '#a89578';
    ctx.fillText(k, rx + 14, yy);
    ctx.fillStyle = c;
    ctx.textAlign = 'right';
    ctx.fillText(v, rx + rw - 14, yy);
    ctx.textAlign = 'left';
  });

  // 各在缫茧剩余比例条
  const barTop = chartY + 44 + rows.length * 26 + 14;
  ctx.fillStyle = '#a89578';
  ctx.fillText('在缫各茧剩余丝层（外→内）', rx + 14, barTop);
  end.remain.forEach((r, i) => {
    const by = barTop + 14 + i * 17;
    const typeId = end.types[i];
    const tName = cocoonType(typeId).name.slice(0, 3);
    ctx.fillStyle = '#7a6a55';
    ctx.font = '10.5px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText(`${i + 1}.${tName}`, rx + 14, by + 9);
    const bx = rx + 78;
    const bwAvail = rw - 92;
    ctx.fillStyle = '#1c1712';
    ctx.fillRect(bx, by, bwAvail, 10);
    ctx.fillStyle = r < 0.1 ? '#c85a4a' : r < 0.25 ? '#d97f3a' : '#9fc27a';
    ctx.fillRect(bx, by, bwAvail * r, 10);
  });

  // 操作按钮
  const opY = chartY + chartH - 24;
  const opW = (rw - 36) / 2;
  const mkOp = (bx: number, label: string, action: string, danger = false) => {
    regions.push({ x: bx, y: opY, w: opW, h: 32, action, payload: selected });
    roundRect(ctx, bx, opY, opW, 32, 6);
    ctx.fillStyle = danger ? '#4a2620' : '#5a4322';
    ctx.fill();
    ctx.strokeStyle = danger ? '#c85a4a' : '#d9a441';
    ctx.stroke();
    ctx.fillStyle = danger ? '#e89a8e' : '#e8c270';
    ctx.font = '600 13px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, bx + opW / 2, opY + 20);
  };
  mkOp(rx + 12, '添绪一粒', 'feed');
  mkOp(rx + 24 + opW, '接绪（断头时）', 'tie', true);
}
