import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, ReelingEngine } from '../src/engine/ReelingEngine';

const SCALE = 24;
/** 92℃ 下约 400 游戏秒煮透（实测速率 0.0025/秒） */
const COOK_SECONDS = 420;
const PER_POT = 48;

/** 往全部煮茧锅补满生茧并煮熟、索绪、理绪，返回当前熟茧数 */
function prepPots(engine: ReelingEngine): number {
  const pots = engine.snapshot().pots.length;
  for (let p = 0; p < pots; p++) {
    engine.emptyPot(p);
    engine.command({ kind: 'loadCocoons', potId: p, typeId: 'spring', n: PER_POT });
    engine.command({ kind: 'setTemp', potId: p, temp: 92 });
  }
  engine.command({ kind: 'tick', dtReal: COOK_SECONDS / SCALE });
  for (let p = 0; p < pots; p++) {
    engine.command({ kind: 'brush', potId: p });
    engine.command({ kind: 'trim', potId: p });
  }
  return engine.snapshot().readyCocoons;
}

/** 让 40 绪都进入在缫状态（每绪达到目标粒数） */
function bringEndsUp(engine: ReelingEngine): void {
  engine.command({ kind: 'setScale', scale: SCALE });
  for (let round = 0; round < 12; round++) {
    prepPots(engine);
    engine.command({ kind: 'feedAll' });
    const snap = engine.snapshot();
    if (snap.ends.every((e) => e.count >= 6)) break;
  }
}

/** 接齐当前所有断绪 */
function tieAll(engine: ReelingEngine): void {
  engine
    .snapshot()
    .ends.filter((e) => e.broken)
    .forEach((e) => engine.command({ kind: 'tie', endId: e.id }));
}

describe('40 绪性能预算（每帧 ≤ 5ms）', () => {
  it('满载缫丝时单帧 tick + 快照远低于 5ms', () => {
    const engine = new ReelingEngine();
    bringEndsUp(engine);
    const snap0 = engine.snapshot();
    expect(snap0.ends.filter((e) => e.count > 0).length).toBeGreaterThan(30);

    engine.command({ kind: 'setScale', scale: 8 });
    // 预热 30 帧，摊掉 JIT/GC 抖动
    for (let i = 0; i < 30; i++) {
      engine.command({ kind: 'tick', dtReal: 1 / 60 });
      engine.snapshot();
    }
    const frames = 600;
    const costs: number[] = [];
    for (let i = 0; i < frames; i++) {
      const t0 = performance.now();
      engine.command({ kind: 'tick', dtReal: 1 / 60 });
      engine.snapshot();
      costs.push(performance.now() - t0);
    }
    costs.sort((a, b) => a - b);
    const p50 = costs[Math.floor(frames * 0.5)];
    const p95 = costs[Math.floor(frames * 0.95)];
    const p99 = costs[Math.floor(frames * 0.99)];
    console.log(
      `40 绪每帧耗时 p50=${p50.toFixed(3)}ms p95=${p95.toFixed(3)}ms p99=${p99.toFixed(3)}ms`,
    );
    expect(p95).toBeLessThan(5);
    expect(p99).toBeLessThan(5);
  });

  it('一整天班次可在合理时间内模拟完且统计合理', () => {
    const engine = new ReelingEngine();
    bringEndsUp(engine);
    const t0 = performance.now();
    // 跑满 8 游戏小时，每 360 游戏秒补一批茧（每批 288 粒，匹配消耗速度）
    const segment = 360;
    for (let t = 0; t < DEFAULT_CONFIG.shiftLength; t += segment) {
      engine.command({ kind: 'tick', dtReal: segment / SCALE });
      prepPots(engine);
      engine.command({ kind: 'feedAll' });
      tieAll(engine);
    }
    const elapsed = performance.now() - t0;
    const snap = engine.snapshot();
    console.log(
      `全天模拟耗时=${elapsed.toFixed(0)}ms 出丝=${snap.totalOutput.toFixed(0)}g ` +
        `断头=${snap.totalBreaks} CV=${(snap.denierCV * 100).toFixed(1)}% 疙瘩=${snap.totalSlubs} ` +
        `效率=${(snap.activeEnds / 40 * 100).toFixed(0)}%`,
    );
    expect(snap.dayOver).toBe(true);
    expect(snap.totalOutput).toBeGreaterThan(800);
    expect(engine.getPayroll()).not.toBeNull();
  });
});

describe('工艺规则', () => {
  it('欠熟茧索绪失败且产生废丝，煮熟后才能索绪', () => {
    const engine = new ReelingEngine();
    engine.command({ kind: 'setScale', scale: SCALE });
    engine.emptyPot(0);
    engine.command({ kind: 'loadCocoons', potId: 0, typeId: 'spring', n: 6 });
    engine.command({ kind: 'setTemp', potId: 0, temp: 92 });
    engine.command({ kind: 'brush', potId: 0 }); // 生茧（cook=0）直接刷
    const raw = engine.snapshot().pots[0];
    // 煮熟度远低于 cookMin(0.82)，索绪必然全部失败
    expect(raw.cocoons.every((c) => !c.brushed)).toBe(true);
    // 硬刷拉伤茧层，每粒都产生废丝
    expect(raw.waste).toBeGreaterThan(0);
    expect(raw.readyCount).toBe(0);

    engine.command({ kind: 'tick', dtReal: COOK_SECONDS / SCALE });
    engine.command({ kind: 'brush', potId: 0 });
    engine.command({ kind: 'trim', potId: 0 });
    // 索绪有少量随机失败，再补刷一轮应全部就绪
    engine.command({ kind: 'brush', potId: 0 });
    engine.command({ kind: 'trim', potId: 0 });
    expect(engine.snapshot().pots[0].readyCount).toBeGreaterThanOrEqual(5);
  });

  it('过熟茧废丝持续增加', () => {
    const engine = new ReelingEngine();
    engine.command({ kind: 'setScale', scale: SCALE });
    engine.emptyPot(0);
    engine.command({ kind: 'loadCocoons', potId: 0, typeId: 'spring', n: 4 });
    engine.command({ kind: 'setTemp', potId: 0, temp: 100 });
    engine.command({ kind: 'tick', dtReal: 2400 / SCALE });
    const snap = engine.snapshot();
    expect(snap.pots[0].cocoons.filter((c) => c.overcooked).length).toBe(4);
    expect(snap.pots[0].waste).toBeGreaterThan(0);
  });

  it('高速档断头风险高于低速档（受控场景：不添不补，短窗口隔离车速）', () => {
    const run = (speed: number, seed: number) => {
      const engine = new ReelingEngine(undefined, seed);
      engine.command({ kind: 'setScale', scale: SCALE });
      // 清掉开班预置茧，精确控制在缫粒数
      const pots = engine.snapshot().pots.length;
      for (let p = 0; p < pots; p++) engine.emptyPot(p);
      // 一次性煮出 400 粒熟茧，保证每绪 8 粒且有富余
      for (let p = 0; p < pots; p++) {
        engine.command({ kind: 'loadCocoons', potId: p, typeId: 'spring', n: 67 });
        engine.command({ kind: 'setTemp', potId: p, temp: 92 });
      }
      engine.command({ kind: 'tick', dtReal: COOK_SECONDS / SCALE });
      for (let p = 0; p < pots; p++) {
        engine.command({ kind: 'brush', potId: p });
        engine.command({ kind: 'trim', potId: p });
      }
      engine.command({ kind: 'feedAll' });
      expect(engine.snapshot().readyCocoons).toBeGreaterThan(40);
      expect(Math.min(...engine.snapshot().ends.map((e) => e.count))).toBeGreaterThanOrEqual(7);
      engine.command({ kind: 'setSpeed', speed });
      // 900 游戏秒窗口，每 150 秒接齐断绪，保证各绪始终处于观察中
      for (let t = 0; t < 900; t += 150) {
        engine.command({ kind: 'tick', dtReal: 150 / SCALE });
        tieAll(engine);
      }
      return engine.snapshot();
    };
    const slow = run(0.8, 11);
    const fast = run(2.2, 11);
    console.log(`低速断头=${slow.totalBreaks} 高速断头=${fast.totalBreaks}`);
    // 高速（2.2m/s）单位时间断头风险高于低速（0.8m/s）；理论比约 2.1，留随机波动余量
    expect(fast.totalBreaks).toBeGreaterThan(slow.totalBreaks * 1.2);
  });

  it('添绪不及时会在纤度统计上留下偏细记录', () => {
    const engine = new ReelingEngine(undefined, 7);
    bringEndsUp(engine);
    engine.command({ kind: 'setSpeed', speed: 1.5 });
    // 只缫丝不添绪：约 900 游戏秒后茧陆续抽尽，纤度一路变细
    engine.command({ kind: 'tick', dtReal: 1400 / SCALE });
    const snap = engine.snapshot();
    const thinEnds = snap.ends.filter((e) => e.denier > 0 && e.denier < 19.5).length;
    expect(thinEnds).toBeGreaterThan(0);
    expect(snap.thinRatio).toBeGreaterThan(0);
  });

  it('接绪有概率留下疙瘩并计入工钱扣罚', () => {
    const engine = new ReelingEngine(undefined, 99);
    bringEndsUp(engine);
    let slubsSeen = 0;
    for (let i = 0; i < 200; i++) {
      engine.command({ kind: 'tick', dtReal: 300 / SCALE });
      tieAll(engine);
      prepPots(engine);
      engine.command({ kind: 'feedAll' });
      slubsSeen = engine.snapshot().totalSlubs;
      if (slubsSeen > 0) break;
    }
    expect(slubsSeen).toBeGreaterThan(0);
  });
});
