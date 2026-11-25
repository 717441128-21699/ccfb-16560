import { describe, expect, it } from 'vitest';
import {
  averageFilamentDenier,
  COCOON_TYPES,
  filamentDenier,
} from '../src/engine/cocoon';

describe('茧丝纤度曲线', () => {
  it.each(COCOON_TYPES.map((t) => [t.name, t] as const))(
    '%s 符合公开测定的三段走势',
    (_name, t) => {
      const d = (x: number) => filamentDenier(t, x);
      // 1. 膨大部峰值出现在茧层前 20% 内，且高于最外层
      const outer = d(0.01);
      const peak = d(t.peakAt);
      expect(peak).toBeGreaterThan(outer);
      expect(t.peakAt).toBeLessThan(0.2);

      // 2. 中段（30%~65%）整体缓慢变细：后段均值低于前段
      let early = 0;
      let late = 0;
      for (let i = 0; i < 8; i++) early += d(0.3 + i * 0.01);
      for (let i = 0; i < 8; i++) late += d(0.58 + i * 0.01);
      expect(late / 8).toBeLessThan(early / 8);

      // 3. 内层陡降：85% 处纤度明显低于 50% 处
      expect(d(0.85)).toBeLessThan(d(0.5) * 0.8);
      // 最内层仅为外层的 40%~60% 左右（至少显著变细）
      expect(d(0.99)).toBeLessThan(d(0.05) * 0.62);

      // 4. 全段连续为正且无跳变
      let prev = d(0);
      for (let i = 1; i <= 200; i++) {
        const v = d(i / 200);
        expect(v).toBeGreaterThan(0.3);
        expect(Math.abs(v - prev)).toBeLessThan(0.25);
        prev = v;
      }
    },
  );

  it.each(COCOON_TYPES.map((t) => [t.name, t] as const))(
    '%s 数值积分均值与设定平均纤度接近',
    (_name, t) => {
      const avg = averageFilamentDenier(t);
      expect(Math.abs(avg - t.meanDenier)).toBeLessThan(0.25);
    },
  );

  it('定粒 8 粒春茧的生丝纤度落在 21 旦尼尔目标带附近', () => {
    const t = COCOON_TYPES[0];
    // 中段 8 粒并合
    const sumAt = (x: number) =>
      Array.from({ length: 8 }, (_, i) =>
        filamentDenier(t, Math.min(0.98, x + i * 0.06)),
      ).reduce((a, b) => a + b, 0);
    expect(sumAt(0.3)).toBeGreaterThan(18);
    expect(sumAt(0.3)).toBeLessThan(25);
  });

  it('抽尽一粒后不添绪，并合纤度明显变细（曲线上可看出的缺口）', () => {
    const t = COCOON_TYPES[0];
    const seven = filamentDenier(t, 0.4) * 7;
    const eight = filamentDenier(t, 0.4) * 8;
    expect(eight - seven).toBeGreaterThan(2); // 缺一粒 ≈ 掉 2.4 旦尼尔
  });
});
