// ============================================================
// citygen.ts — 一键城市生成器
//
// 输入：现有地形（保留水面/沙地/岩石），在其上程序化铺设：
//   1. 外环耕地带   2. 道路网格（自动避开水面）
//   3. 地标建筑（纪念碑/体育场/城堡/灯塔/学校/医院…）
//   4. 按分区密度填充建筑（核心商务 / 中层住宅 / 郊区 /
//      扇区工业）   5. 行道树与野生树
// 全部通过 CityMap 规则放置（不与水/路/已有建筑冲突）。
// ============================================================

import { CityMap, TERR_FARM, TERR_GRASS, TERR_ROCK, TERR_SAND, TERR_WATER } from './map';
import { mulberry32, fbm, hash2 } from './rng';

type Dist = 'core' | 'mid' | 'sub' | 'outer' | 'ind';

export type GenReport = {
  buildings: number; pop: number; roads: number; trees: number; land: number;
};

export function generateCity(map: CityMap, seed: number): GenReport | null {
  const r = mulberry32(seed);
  const n = map.n;
  const c = (n - 1) / 2;
  const tries = Math.floor(700 * (n / 128) * (n / 128));   // 地标尝试次数随面积缩放
  const roadGap = () => 6.5 + r() * 4.5 + (n > 160 ? 1.6 : 0);
  let land = 0;

  map.beginUpdate();
  try {
    map.clearObjects();
    for (let i = 0; i < n * n; i++) if (map.terr[i] !== TERR_WATER) land++;
    if (land < n * n * 0.25) return null;   // 平地太少，放弃

    // ---------- 0) 外环耕地带 ----------
    const farmN = (x: number, y: number): number =>
      fbm(x / 12 + 40, y / 12 + 40, seed ^ 0xA11CE5);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const i = map.idx(x, y);
        if (map.terr[i] !== TERR_GRASS) continue;
        const dc = Math.hypot(x - c, y - c);
        if (dc < n * 0.34 || dc > n * 0.64) continue;
        if (farmN(x, y) > 0.585) map.setTerr(x, y, TERR_FARM);
      }
    }

    // ---------- 1) 道路网格 ----------
    const xs: number[] = [];
    const ys: number[] = [];
    let px = 7 + r() * 5;
    while (px < n - 7) {
      const q = Math.round(px);
      if (!xs.some(v => Math.abs(v - q) < 4)) xs.push(q);
      px += roadGap();
    }
    if (!xs.some(v => Math.abs(v - Math.round(c)) < 4)) xs.push(Math.round(c));
    let py = 7 + r() * 5;
    while (py < n - 7) {
      const q = Math.round(py);
      if (!ys.some(v => Math.abs(v - q) < 4)) ys.push(q);
      py += roadGap();
    }
    if (!ys.some(v => Math.abs(v - Math.round(c)) < 3)) ys.push(Math.round(c));
    for (const gx of xs) for (let y = 0; y < n; y++) map.setRoad(gx, y, true);
    for (const gy of ys) for (let x = 0; x < n; x++) map.setRoad(x, gy, true);

    // ---------- 2) 分区函数 ----------
    const indAng = r() * Math.PI * 2;   // 工业扇区方位
    const dist = (x: number, y: number): Dist => {
      const dc = Math.hypot(x - c, y - c);
      let a = Math.atan2(y - c, x - c) - indAng;
      a = Math.atan2(Math.sin(a), Math.cos(a));
      if (Math.abs(a) < 0.55 && dc > n * 0.26 && dc < n * 0.62) return 'ind';
      if (dc < n * 0.13) return 'core';
      if (dc < n * 0.30) return 'mid';
      if (dc < n * 0.47) return 'sub';
      return 'outer';
    };

    // ---------- 3) 地标建筑 ----------
    const tryPlace = (
      id: string, count: number, lo: number, hi: number,
      opts: { ind?: boolean } = {},
    ): number => {
      let placed = 0;
      for (let t = 0; t < tries && placed < count; t++) {
        const x = Math.floor(r() * n), y = Math.floor(r() * n);
        const i = map.idx(x, y);
        if (map.terr[i] === TERR_WATER || map.terr[i] === TERR_FARM
          || map.terr[i] === TERR_ROCK || map.terr[i] === TERR_SAND) continue;
        if (map.occ[i] >= 0 || map.road[i]) continue;
        const dc = Math.hypot(x - c, y - c) / n;
        if (dc < lo || dc > hi) continue;
        if (opts.ind && dist(x, y) !== 'ind') continue;
        if (map.place(id, Math.floor(r() * 8), x, y)) placed++;
      }
      return placed;
    };

    tryPlace('monument', 1, 0.00, 0.08);
    tryPlace('plaza', 2, 0.03, 0.14);
    tryPlace('clocktower', 1, 0.00, 0.09);
    tryPlace('restower', 2, 0.02, 0.20);
    tryPlace('hotel', 1, 0.05, 0.22);
    tryPlace('mall', 1, 0.04, 0.20);
    tryPlace('cinema', 1, 0.08, 0.26);
    tryPlace('museum', 1, 0.16, 0.34);
    tryPlace('school', 1, 0.16, 0.34);
    tryPlace('hospital', 1, 0.15, 0.32);
    tryPlace('temple', 1, 0.26, 0.50);
    tryPlace('torii', 1, 0.24, 0.55);
    tryPlace('observatory', 1, 0.30, 0.62);
    tryPlace('church', 3, 0.20, 0.55);
    tryPlace('firestation', 2, 0.15, 0.50);
    tryPlace('market', 2, 0.12, 0.50);
    if (r() < 0.65) tryPlace('castle', 1, 0.46, 0.72);
    tryPlace('stadium', 1, 0.30, 0.60);
    tryPlace('radiotower', 1, 0.52, 0.80);
    tryPlace('power', 1, 0, 1, { ind: true });
    tryPlace('refinery', 1, 0, 1, { ind: true });
    tryPlace('tankfarm', 2, 0, 1, { ind: true });
    tryPlace('warehouse', 1, 0, 1, { ind: true });
    tryPlace('lumber', 1, 0, 1, { ind: true });
    tryPlace('silo', 2, 0, 1, { ind: true });

    // 灯塔：寻找临水沙地
    let lhPlaced = 0;
    const off = Math.floor(r() * n);
    for (let yy = 0; yy < n && lhPlaced < 2; yy++) {
      const y = (yy + off) % n;
      for (let xx = 0; xx < n && lhPlaced < 2; xx++) {
        const x = (xx + off * 3) % n;
        const i = map.idx(x, y);
        if (map.terr[i] !== TERR_SAND || map.occ[i] >= 0 || map.road[i]) continue;
        const nearWater =
          (map.inB(x + 1, y) && map.terr[map.idx(x + 1, y)] === TERR_WATER) ||
          (map.inB(x - 1, y) && map.terr[map.idx(x - 1, y)] === TERR_WATER) ||
          (map.inB(x, y + 1) && map.terr[map.idx(x, y + 1)] === TERR_WATER) ||
          (map.inB(x, y - 1) && map.terr[map.idx(x, y - 1)] === TERR_WATER);
        if (nearWater && map.place('lighthouse', 0, x, y)) lhPlaced++;
      }
    }

    // 港口吊机：临水岸线（集装箱码头）
    let dockN = 0;
    for (let t = 0; t < tries * 4 && dockN < 2; t++) {
      const x = Math.floor(r() * n), y = Math.floor(r() * n);
      const i = map.idx(x, y);
      if (map.terr[i] === TERR_WATER || map.occ[i] >= 0 || map.road[i]) continue;
      let waterNear = false;
      for (let dy = -2; dy <= 2 && !waterNear; dy++) {
        for (let dx = -2; dx <= 2 && !waterNear; dx++) {
          if (map.inB(x + dx, y + dy) && map.terr[map.idx(x + dx, y + dy)] === TERR_WATER) waterNear = true;
        }
      }
      if (waterNear && map.place('dock', 0, x, y)) dockN++;
    }

    // ---------- 4) 分区填充 ----------
    const nearRoad = (x: number, y: number): boolean => {
      if (map.inB(x + 1, y) && map.road[map.idx(x + 1, y)]) return true;
      if (map.inB(x - 1, y) && map.road[map.idx(x - 1, y)]) return true;
      if (map.inB(x, y + 1) && map.road[map.idx(x, y + 1)]) return true;
      if (map.inB(x, y - 1) && map.road[map.idx(x, y - 1)]) return true;
      return false;
    };
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const i = map.idx(x, y);
        if (map.road[i] || map.occ[i] >= 0 || map.terr[i] === TERR_WATER) continue;
        const h = hash2(x, y, seed);
        const h2 = hash2(x, y, seed ^ 0x5EED);
        const d = dist(x, y);
        // 沙地海岸：少量海滩公园
        if (map.terr[i] === TERR_SAND) {
          if (h < 0.06) map.place('park', (h2 * 8) | 0, x, y);
          continue;
        }
        // 岩石高地：基本留荒
        if (map.terr[i] === TERR_ROCK) {
          if (h < 0.03) map.place('park', (h2 * 8) | 0, x, y);
          continue;
        }
        const onFarm = map.terr[i] === TERR_FARM;
        const nr = nearRoad(x, y);
        if (d === 'core') {
          if (h < 0.10) { if (map.place('tower', (h2 * 8) | 0, x, y)) continue; }
          if (nr && h < 0.38) {
            map.place(h2 < 0.42 ? 'shop' : h2 < 0.72 ? 'conv' : 'izakaya', (h2 * 8) | 0, x, y);
            continue;
          }
          if (h < 0.50) { map.place('office', (h2 * 8) | 0, x, y); continue; }
          if (h < 0.56) { map.place('parking', (h2 * 8) | 0, x, y); continue; }
          if (h < 0.66) { map.place('park', (h2 * 8) | 0, x, y); continue; }
        } else if (d === 'mid') {
          if (onFarm) continue;
          if (h < 0.05) { if (map.place('danchi', (h2 * 8) | 0, x, y)) continue; }
          if (nr && h < 0.09) {
            map.place(h2 < 0.4 ? 'shop' : h2 < 0.7 ? 'izakaya' : 'market', (h2 * 8) | 0, x, y);
            continue;
          }
          if (h < 0.19) { map.place('apartment', (h2 * 8) | 0, x, y); continue; }
          if (h < 0.29) { map.place('townhouse', (h2 * 8) | 0, x, y); continue; }
          if (h < 0.37) { map.place('house', (h2 * 8) | 0, x, y); continue; }
          if (h < 0.41) { map.place('park', (h2 * 8) | 0, x, y); continue; }
          if (h < 0.44) { map.place('parking', (h2 * 8) | 0, x, y); continue; }
        } else if (d === 'sub') {
          if (onFarm) continue;
          if (h < 0.06) { map.place('machiya', (h2 * 8) | 0, x, y); continue; }
          if (h < 0.15) { map.place('house', (h2 * 8) | 0, x, y); continue; }
          if (h < 0.20) { map.place('manor', (h2 * 8) | 0, x, y); continue; }
          if (h < 0.25) { map.place('townhouse', (h2 * 8) | 0, x, y); continue; }
          if (h < 0.27) { map.place('market', (h2 * 8) | 0, x, y); continue; }
          if (h < 0.31) { map.place('park', (h2 * 8) | 0, x, y); continue; }
          if (h < 0.34) { map.place('church', (h2 * 8) | 0, x, y); continue; }
        } else if (d === 'ind') {
          if (onFarm) continue;
          if (h < 0.10) { if (map.place('factory', (h2 * 8) | 0, x, y)) continue; }
          if (h < 0.15) { if (map.place('lumber', (h2 * 8) | 0, x, y)) continue; }
          if (h < 0.32) { if (map.place('warehouse', (h2 * 8) | 0, x, y)) continue; }
          if (h < 0.38) { map.place('silo', (h2 * 8) | 0, x, y); continue; }
          if (h < 0.43) { map.place('tankfarm', (h2 * 8) | 0, x, y); continue; }
          if (h < 0.48) { map.place('parking', (h2 * 8) | 0, x, y); continue; }
        } else {   // outer
          if (onFarm) continue;
          if (h < 0.05) { map.place('machiya', (h2 * 8) | 0, x, y); continue; }
          if (h < 0.10) { map.place('house', (h2 * 8) | 0, x, y); continue; }
          if (h < 0.12) { map.place('manor', (h2 * 8) | 0, x, y); continue; }
          if (h < 0.14) { map.place('church', (h2 * 8) | 0, x, y); continue; }
        }
      }
    }

    // ---------- 5) 巴士站（沿路布置） ----------
    let busN = 0;
    const busMax = Math.max(3, Math.floor(n / 22));
    for (let t = 0; t < tries * 3 && busN < busMax; t++) {
      const x = Math.floor(r() * n), y = Math.floor(r() * n);
      const i = map.idx(x, y);
      if (map.road[i] || map.occ[i] >= 0 || map.tree[i] >= 0) continue;
      if (map.terr[i] !== TERR_GRASS) continue;
      const near =
        (map.inB(x + 1, y) && map.road[map.idx(x + 1, y)]) ||
        (map.inB(x - 1, y) && map.road[map.idx(x - 1, y)]) ||
        (map.inB(x, y + 1) && map.road[map.idx(x, y + 1)]) ||
        (map.inB(x, y - 1) && map.road[map.idx(x, y - 1)]);
      if (near && map.place('busstop', Math.floor(r() * 2), x, y)) busN++;
    }

    // ---------- 6) 行道树 / 野生树 ----------
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const i = map.idx(x, y);
        if (map.road[i] || map.occ[i] >= 0) continue;
        if (map.terr[i] !== TERR_GRASS) continue;
        const h = hash2(x, y, seed ^ 0x7EE7);
        const d = dist(x, y);
        const nr = nearRoad(x, y);
        if ((d === 'mid' || d === 'sub') && nr && h < 0.17) { map.plantTree(x, y); continue; }
        if (d === 'ind' && nr && h < 0.06) { map.plantTree(x, y); continue; }
        if (d === 'outer' && h < 0.16) { map.plantTree(x, y); continue; }
      }
    }
  } finally {
    map.endUpdate();
  }

  const st = map.stats();
  return { buildings: st.buildings, pop: st.pop, roads: st.roads, trees: st.trees, land };
}
