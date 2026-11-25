/** 可播种的 mulberry32 伪随机数，保证测试可复现 */
export class Rng {
  private state: number;

  constructor(seed = 1) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** 单位时间（秒）风险率 hazard 下，dt 内发生事件的概率 */
  hazard(hazardPerSec: number, dt: number): boolean {
    return this.next() < 1 - Math.exp(-hazardPerSec * dt);
  }
}
