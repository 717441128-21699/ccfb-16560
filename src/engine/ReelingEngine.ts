import {
  cocoonType,
  COCOON_TYPES,
  denierToGramsPerMeter,
  filamentDenier,
  TARGET_BAND_HIGH,
  TARGET_BAND_LOW,
} from './cocoon';
import { Rng } from './rng';
import type {
  CookPot,
  CookingCocoon,
  EngineCommand,
  EngineConfig,
  EngineSnapshot,
  EndSnapshot,
  GameEvent,
  PayrollResult,
  PotSnapshot,
  ReelingCocoon,
  ReelingEnd,
} from './types';

const HISTORY_INTERVAL = 4; // 每 4 游戏秒采样一个纤度点
const EVENT_LOG_LIMIT = 40;
const TIE_DURATION = 1.5; // 接绪操作耗时（游戏秒）
const BASE_BREAK_HAZARD = 0.00008; // 基准断头风险（每秒，随车速 2.2 次方放大）
const RANDOM_BREAK_HAZARD = 0.00002; // 随机断绪噪声

export const DEFAULT_CONFIG: EngineConfig = {
  endCount: 40,
  potCount: 6,
  potCapacity: 80,
  shiftLength: 28800,
  historySamples: 180,
};

export class ReelingEngine {
  private cfg: EngineConfig;
  private rng: Rng;
  private seed: number;
  private ends: ReelingEnd[] = [];
  private pots: CookPot[] = [];
  private nextCocoonId = 1;
  gameTime = 0;
  running = true;
  dayOver = false;
  speed = 1.5;
  timeScale = 8;
  private sampleTimer = 0;
  private events: GameEvent[] = [];
  private payroll: PayrollResult | null = null;

  constructor(cfg: EngineConfig = DEFAULT_CONFIG, seed = 20261125) {
    this.cfg = { ...cfg };
    this.seed = seed;
    this.rng = new Rng(seed);
    this.reset();
  }

  reset(): void {
    this.rng = new Rng(this.seed);
    this.gameTime = 0;
    this.running = true;
    this.dayOver = false;
    this.speed = 1.5;
    this.timeScale = 8;
    this.sampleTimer = 0;
    this.events = [];
    this.payroll = null;
    this.nextCocoonId = 1;
    this.ends = Array.from({ length: this.cfg.endCount }, (_, i) => ({
      id: i,
      cocoons: [],
      idle: true,
      broken: false,
      brokenTime: 0,
      breaks: 0,
      slubs: 0,
      slubTimer: 0,
      outputMass: 0,
      wasteMass: 0,
      activeTime: 0,
      currentDenier: 0,
      history: new Float64Array(this.cfg.historySamples),
      historyHead: 0,
      historyCount: 0,
      meanAcc: 0,
      m2Acc: 0,
      sampleCount: 0,
      thinTime: 0,
      lastEvent: '',
      lastEventTimer: 0,
    }));
    this.pots = Array.from({ length: this.cfg.potCount }, (_, i) => ({
      id: i,
      temperature: 55,
      targetTemp: 92,
      cocoons: [],
    }));
    // 开班预置：前两口锅各备 30 粒已索绪理绪的熟茧，让挡车工一上来就能添绪起绪
    for (let p = 0; p < Math.min(2, this.pots.length); p++) {
      for (let i = 0; i < 30; i++) {
        this.pots[p].cocoons.push({
          id: this.nextCocoonId++,
          typeId: 'spring',
          cook: 0.96,
          brushed: true,
          trimmed: true,
          waste: 0.02,
        });
      }
      this.pots[p].temperature = 92;
    }
  }

  // ---------- 指令入口 ----------

  command(cmd: EngineCommand): void {
    switch (cmd.kind) {
      case 'tick':
        this.step(cmd.dtReal);
        break;
      case 'setSpeed':
        this.speed = Math.min(2.2, Math.max(0.8, cmd.speed));
        break;
      case 'setScale':
        this.timeScale = cmd.scale;
        break;
      case 'setPaused':
        this.running = !cmd.paused;
        break;
      case 'loadCocoons':
        this.loadCocoons(cmd.potId, cmd.typeId, cmd.n);
        break;
      case 'setTemp': {
        const pot = this.pots[cmd.potId];
        if (pot) pot.targetTemp = Math.min(100, Math.max(60, cmd.temp));
        break;
      }
      case 'brush':
        this.brush(cmd.potId);
        break;
      case 'trim':
        this.trim(cmd.potId);
        break;
      case 'feed':
        this.feed(cmd.endId);
        break;
      case 'feedAll':
        this.feedAll();
        break;
      case 'tie':
        this.tie(cmd.endId);
        break;
      case 'reset':
        this.reset();
        break;
    }
  }

  // ---------- 煮茧 ----------

  /** 清空一口煮茧锅（测试辅助，也对应车间里"倒锅换茧"操作），锅内茧全部计废丝 */
  emptyPot(potId: number): void {
    const pot = this.pots[potId];
    if (!pot) return;
    for (const c of pot.cocoons) c.waste += 0.02;
    pot.cocoons.length = 0;
  }

  loadCocoons(potId: number, typeId: string, n: number): void {
    const pot = this.pots[potId];
    if (!pot) return;
    const room = this.cfg.potCapacity - pot.cocoons.length;
    const add = Math.min(room, Math.max(0, n));
    for (let i = 0; i < add; i++) {
      const c: CookingCocoon = {
        id: this.nextCocoonId++,
        typeId,
        cook: 0,
        brushed: false,
        trimmed: false,
        waste: 0,
      };
      pot.cocoons.push(c);
    }
  }

  /** 索绪：用刷子在锅中找丝头。煮熟度不够则失败并拉伤茧层 */
  brush(potId: number): void {
    const pot = this.pots[potId];
    if (!pot) return;
    for (const c of pot.cocoons) {
      if (c.brushed) continue;
      const t = cocoonType(c.typeId);
      if (c.cook < t.cookMin) {
        // 丝胶未软化，硬刷只会产生废丝
        c.waste += 0.012 + this.rng.next() * 0.01;
        continue;
      }
      // 过熟茧丝头散乱，索绪成功率下降
      const over = Math.max(0, c.cook - t.cookMax);
      const p = 0.92 - over * 1.6;
      if (this.rng.next() < p) {
        c.brushed = true;
        c.waste += 0.006;
      } else {
        c.waste += 0.02;
      }
    }
  }

  /** 理绪：去掉外层杂乱丝衣，完成后才可添绪 */
  trim(potId: number): void {
    const pot = this.pots[potId];
    if (!pot) return;
    for (const c of pot.cocoons) {
      if (!c.brushed || c.trimmed) continue;
      const t = cocoonType(c.typeId);
      c.trimmed = true;
      // 理绪必然剥掉一部分外层废丝，过熟茧剥掉更多
      const over = Math.max(0, c.cook - t.cookMax);
      c.waste += 0.018 + over * 0.06;
    }
  }

  private updatePots(dt: number): void {
    for (const pot of this.pots) {
      // 水温向目标温度逼近（每秒 6℃ 的加热/散热速率）
      const dT = pot.targetTemp - pot.temperature;
      pot.temperature += Math.sign(dT) * Math.min(Math.abs(dT), 6 * dt);
      if (pot.cocoons.length === 0) continue;
      // 煮熟速率：92℃ 为标准水温，低于 80℃ 几乎煮不动
      const heat = Math.max(0, pot.temperature - 70) / 22;
      for (const c of pot.cocoons) {
        const t = cocoonType(c.typeId);
        const rate = t.tempEfficiency * heat;
        c.cook += rate * dt;
        // 过熟：尚未理绪的茧茧层溃散才持续产生废丝；已就绪熟茧等待添绪，不再计废丝
        const over = c.cook - t.cookMax;
        if (over > 0 && !c.trimmed) {
          c.waste += over * 0.004 * dt;
        }
      }
    }
  }

  private isReady(c: CookingCocoon): boolean {
    const t = cocoonType(c.typeId);
    return c.trimmed && c.cook >= t.cookMin;
  }

  /** 从全部锅中取最早就绪的一粒熟茧（跨锅先进先出） */
  private takeReadyCocoon(): ReelingCocoon | null {
    for (const pot of this.pots) {
      for (let idx = 0; idx < pot.cocoons.length; idx++) {
        const c = pot.cocoons[idx];
        if (this.isReady(c)) {
          pot.cocoons.splice(idx, 1);
          const t = cocoonType(c.typeId);
          return {
            id: c.id,
            typeId: c.typeId,
            drawn: 0,
            length: t.filamentLength * (0.94 + this.rng.next() * 0.12),
            cookScore: c.cook,
          };
        }
      }
    }
    return null;
  }

  // ---------- 添绪 / 接绪 ----------

  feed(endId: number): void {
    const end = this.ends[endId];
    if (!end || end.broken) return;
    const cocoon = this.takeReadyCocoon();
    if (!cocoon) return;
    end.cocoons.push(cocoon);
    end.idle = false;
    end.lastEvent = 'feed';
    end.lastEventTimer = 2;
    this.log(end.id, 'feed', `第 ${end.id + 1} 绪添绪一粒（${cocoonType(cocoon.typeId).name}）`);
  }

  feedAll(): void {
    // 空绪先起绪，再按粒数从少到多逐轮补齐到目标粒数
    const order = () =>
      [...this.ends]
        .filter((e) => !e.broken)
        .sort((a, b) => a.cocoons.length - b.cocoons.length || a.currentDenier - b.currentDenier);
    for (const end of order()) {
      if (this.readyCount() === 0) break;
      if (end.cocoons.length === 0) this.feed(end.id);
    }
    // 逐轮补齐：每轮给粒数最少的绪各添一粒，直到无熟茧或全部达到目标粒数
    for (let round = 0; round < 12; round++) {
      if (this.readyCount() === 0) break;
      let progressed = false;
      for (const end of order()) {
        if (this.readyCount() === 0) break;
        const typeId = end.cocoons[0]?.typeId ?? COCOON_TYPES[0].id;
        const target = cocoonType(typeId).targetCount;
        if (end.cocoons.length >= target) continue;
        // 达到目标带后不再追加
        if (end.cocoons.length > 0 && end.currentDenier >= TARGET_BAND_LOW) {
          const projected = end.currentDenier + cocoonType(typeId).meanDenier;
          if (projected > TARGET_BAND_HIGH + 1) continue;
        }
        this.feed(end.id);
        progressed = true;
      }
      if (!progressed) break;
    }
  }

  tie(endId: number): void {
    const end = this.ends[endId];
    if (!end || !end.broken) return;
    end.broken = false;
    end.brokenTime = 0;
    end.idle = end.cocoons.length === 0;
    // 手工接绪质量：手稳时 18% 概率留下疙瘩
    if (this.rng.next() < 0.18) {
      end.slubs += 1;
      end.slubTimer = 6;
      end.lastEvent = 'slub';
      end.lastEventTimer = 3;
      this.log(end.id, 'slub', `第 ${end.id + 1} 绪接绪不良，出现一个疙瘩`);
    } else {
      end.lastEvent = 'tie';
      end.lastEventTimer = 2;
      this.log(end.id, 'tie', `第 ${end.id + 1} 绪接绪完成`);
    }
  }

  // ---------- 主步进 ----------

  step(dtReal: number): void {
    if (this.dayOver) return;
    if (!this.running) return;
    // 固定 0.2 游戏秒为一个内部 tick，避免大倍速下风险积分失真
    const gameDt = dtReal * this.timeScale;
    let remaining = gameDt;
    const internal = 0.2;
    let guard = 0;
    while (remaining > 1e-9 && guard < 4096) {
      const dt = Math.min(internal, remaining);
      this.tick(dt);
      remaining -= dt;
      guard++;
      if (this.dayOver) break;
    }
  }

  private tick(dt: number): void {
    this.gameTime += dt;
    this.updatePots(dt);
    for (const end of this.ends) {
      this.tickEnd(end, dt);
      if (end.lastEventTimer > 0) end.lastEventTimer -= dt;
    }
    // 纤度历史采样
    this.sampleTimer -= dt;
    if (this.sampleTimer <= 0) {
      this.sampleTimer = HISTORY_INTERVAL;
      for (const end of this.ends) this.pushSample(end);
    }
    if (this.gameTime >= this.cfg.shiftLength) {
      this.gameTime = this.cfg.shiftLength;
      this.dayOver = true;
      this.running = false;
      this.payroll = this.computePayroll();
    }
  }

  private tickEnd(end: ReelingEnd, dt: number): void {
    if (end.slubTimer > 0) end.slubTimer = Math.max(0, end.slubTimer - dt);
    if (end.broken) {
      end.brokenTime += dt;
      end.currentDenier = 0;
      return;
    }
    if (end.idle || end.cocoons.length === 0) {
      end.idle = true;
      end.currentDenier = 0;
      return;
    }

    end.activeTime += dt;
    const lengthDrawn = this.speed * dt;

    // 逐粒抽丝，处理抽尽
    for (let i = end.cocoons.length - 1; i >= 0; i--) {
      const c = end.cocoons[i];
      c.drawn += lengthDrawn;
      if (c.drawn >= c.length) {
        end.cocoons.splice(i, 1);
        end.lastEvent = 'exhaust';
        end.lastEventTimer = 2.5;
        this.log(end.id, 'exhaust', `第 ${end.id + 1} 绪一粒茧抽尽，需立即添绪`);
      }
    }

    // 断头风险：车速为主导项，欠熟/过熟/内层蛹衬/粒数偏少为附加项
    const speedMul = this.speed / 1.5;
    let hazard = BASE_BREAK_HAZARD * Math.pow(speedMul, 2.2) + RANDOM_BREAK_HAZARD;
    for (const c of end.cocoons) {
      const t = cocoonType(c.typeId);
      if (c.cookScore < t.cookMin) hazard += 0.001 * (1 - c.cookScore / t.cookMin);
      const over = c.cookScore - t.cookMax;
      if (over > 0) hazard += over * 0.002;
      const x = c.drawn / c.length;
      if (x > 0.92) hazard += 0.0003 * ((x - 0.92) / 0.08); // 蛹衬处丝质脆弱
    }
    if (end.cocoons.length <= 5) hazard += 0.0002;

    if (this.rng.hazard(hazard, dt)) {
      end.broken = true;
      end.brokenTime = 0;
      end.breaks += 1;
      end.lastEvent = 'break';
      end.lastEventTimer = 4;
      // 断头瞬间散落的丝成为废丝
      end.wasteMass += 0.05 + this.rng.next() * 0.05;
      this.log(end.id, 'break', `第 ${end.id + 1} 绪断头！速去接绪`);
      end.currentDenier = 0;
      return;
    }

    // 纤度 = 在缫各粒茧瞬时纤度之和；疙瘩期虚高
    let denier = 0;
    for (const c of end.cocoons) {
      const t = cocoonType(c.typeId);
      denier += filamentDenier(t, c.drawn / c.length);
    }
    if (end.slubTimer > 0) denier *= 1.28;
    end.currentDenier = denier;

    // 出丝质量累计
    end.outputMass += denierToGramsPerMeter(denier) * lengthDrawn;

    if (denier < TARGET_BAND_LOW) end.thinTime += dt;
  }

  private pushSample(end: ReelingEnd): void {
    const value = end.broken || end.idle ? NaN : end.currentDenier;
    end.history[end.historyHead] = value;
    end.historyHead = (end.historyHead + 1) % end.history.length;
    end.historyCount = Math.min(end.historyCount + 1, end.history.length);
    if (!Number.isNaN(value)) {
      // Welford 在线均值/方差
      end.sampleCount += 1;
      const delta = value - end.meanAcc;
      end.meanAcc += delta / end.sampleCount;
      const delta2 = value - end.meanAcc;
      end.m2Acc += delta * delta2;
    }
  }

  // ---------- 统计与快照 ----------

  readyCount(): number {
    let n = 0;
    for (const pot of this.pots) for (const c of pot.cocoons) if (this.isReady(c)) n++;
    return n;
  }

  /** 把环形缓冲重排为时间正序，供单绪监看页画纤度曲线 */
  private orderedHistory(end: ReelingEnd): Float64Array {
    const out = new Float64Array(end.historyCount);
    const start = (end.historyHead - end.historyCount + end.history.length) % end.history.length;
    for (let i = 0; i < end.historyCount; i++) {
      out[i] = end.history[(start + i) % end.history.length];
    }
    return out;
  }

  private warnLevel(end: ReelingEnd): number {
    if (end.broken || end.idle) return 3;
    if (end.currentDenier < TARGET_BAND_LOW) return 2;
    for (const c of end.cocoons) {
      if (1 - c.drawn / c.length < 0.1) return 2;
    }
    if (end.cocoons.length <= 6) return 1;
    return 0;
  }

  snapshot(): EngineSnapshot {
    let totalOutput = 0;
    let totalWaste = 0;
    let totalBreaks = 0;
    let totalSlubs = 0;
    let activeEnds = 0;
    let thinTime = 0;
    let meanSum = 0;
    let meanN = 0;
    let cvSum = 0;
    let cvN = 0;

    const endSnaps: EndSnapshot[] = this.ends.map((end) => {
      totalOutput += end.outputMass;
      totalWaste += end.wasteMass;
      totalBreaks += end.breaks;
      totalSlubs += end.slubs;
      thinTime += end.thinTime;
      if (!end.idle && !end.broken) activeEnds++;
      if (end.sampleCount > 1) {
        meanSum += end.meanAcc;
        meanN++;
        const variance = end.m2Acc / (end.sampleCount - 1);
        cvSum += Math.sqrt(variance) / end.meanAcc;
        cvN++;
      }
      return {
        id: end.id,
        count: end.cocoons.length,
        denier: end.currentDenier,
        idle: end.idle,
        broken: end.broken,
        breaks: end.breaks,
        slubs: end.slubs,
        outputMass: end.outputMass,
        wasteMass: end.wasteMass,
        thinTime: end.thinTime,
        warnLevel: this.warnLevel(end),
        event: end.lastEvent,
        eventTimer: end.lastEventTimer,
        remain: end.cocoons.map((c) => Math.max(0, 1 - c.drawn / c.length)),
        types: end.cocoons.map((c) => c.typeId),
        history: this.orderedHistory(end),
      };
    });

    const potSnaps: PotSnapshot[] = this.pots.map((pot) => ({
      id: pot.id,
      temperature: pot.temperature,
      targetTemp: pot.targetTemp,
      readyCount: pot.cocoons.filter((c) => this.isReady(c)).length,
      waste: pot.cocoons.reduce((s, c) => s + c.waste, 0),
      cocoons: pot.cocoons.map((c) => {
        const t = cocoonType(c.typeId);
        return {
          typeId: c.typeId,
          cook: c.cook,
          brushed: c.brushed,
          trimmed: c.trimmed,
          ready: this.isReady(c),
          // 已理绪的熟茧在库存中等待添绪，不再视为过熟告警
          overcooked: c.cook > t.cookMax && !c.trimmed,
        };
      }),
    }));

    const meanDenier = meanN ? meanSum / meanN : 0;
    const denierCV = cvN ? cvSum / cvN : 0;
    const totalActive = this.ends.reduce((s, e) => s + e.activeTime, 0);
    const thinRatio = totalActive > 0 ? thinTime / totalActive : 0;
    const cookingWaste = this.pots.reduce(
      (s, p) => s + p.cocoons.reduce((w, c) => w + c.waste, 0),
      0,
    );

    return {
      gameTime: this.gameTime,
      shiftLength: this.cfg.shiftLength,
      running: this.running,
      dayOver: this.dayOver,
      speed: this.speed,
      timeScale: this.timeScale,
      totalOutput,
      totalWaste: totalWaste + cookingWaste,
      totalBreaks,
      totalSlubs,
      meanDenier,
      denierCV,
      thinRatio,
      activeEnds,
      readyCocoons: this.readyCount(),
      ends: endSnaps,
      pots: potSnaps,
      events: [...this.events].reverse(),
    };
  }

  getPayroll(): PayrollResult | null {
    return this.payroll;
  }

  private computePayroll(): PayrollResult {
    const snap = this.snapshot();
    const totalActive = this.ends.reduce((s, e) => s + e.activeTime, 0);
    const capacity = this.ends.length * this.cfg.shiftLength;
    const efficiency = capacity > 0 ? totalActive / capacity : 0;

    // 匀度等级按生丝纤度 CV（变异系数）划分
    let grade: string;
    let qualityBonus: number;
    if (snap.denierCV < 0.06) {
      grade = 'AAA（优等匀度）';
      qualityBonus = 120;
    } else if (snap.denierCV < 0.1) {
      grade = 'AA（良好）';
      qualityBonus = 70;
    } else if (snap.denierCV < 0.15) {
      grade = 'A（合格）';
      qualityBonus = 25;
    } else {
      grade = 'B（匀度不合格）';
      qualityBonus = 0;
    }

    const pieceWage = snap.totalOutput * 0.08; // 计件：每克生丝 0.08 元
    const breakPenalty = snap.totalBreaks * 1.2;
    const wastePenalty = snap.totalWaste * 0.5;
    const totalWage = Math.max(
      0,
      pieceWage + qualityBonus - breakPenalty - wastePenalty,
    );

    return {
      outputMass: snap.totalOutput,
      wasteMass: snap.totalWaste,
      breaks: snap.totalBreaks,
      slubs: snap.totalSlubs,
      meanDenier: snap.meanDenier,
      cv: snap.denierCV,
      thinRatio: snap.thinRatio,
      efficiency,
      grade,
      pieceWage,
      qualityBonus,
      breakPenalty,
      wastePenalty,
      totalWage,
    };
  }

  private log(endId: number, kind: GameEvent['kind'], message: string): void {
    this.events.push({ t: this.gameTime, endId, kind, message });
    if (this.events.length > EVENT_LOG_LIMIT) this.events.shift();
  }
}
