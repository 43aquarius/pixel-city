// ============================================================
// aviation.ts — v42 鲲鹏展翅·空港之城（纯函数模块）
//
// 空港是城市的对外门户：航站楼落成即开基础航线（邻省都会），
// 姊妹之城好感到位各开花一条国际航线（外交纵深 v37 的经济延伸），
// 人口百万级都市再开远洋枢纽线 —— 航线越多，游客与空运越旺。
// 商圈与噪音是一对权衡：机场半径 7 格内的商铺沾空港客流的光
// （收入 ×1.08），但 4 格内的住宅得忍受起降噪音（幸福 −0.8/栋）。
// 全部为纯函数（rnd/依赖零注入），bun 直测与引擎共用。
// ============================================================

/** 空港商圈半径（切比雪夫，自机场锚点起算）：圈内的商铺沾空港客流的光 */
export const AIR_SERVE_R = 7;
/** 空港商圈商铺收入乘数（客流直达：外来的客商、出差的市民、赶飞机的旅人） */
export const AIR_EARN_K = 1.08;
/** 噪音圈半径（切比雪夫）：起降航线正下方，飞机掠过屋顶的日子 */
export const AIR_NOISE_R = 4;
/** 噪音圈住宅幸福惩罚（每栋 −0.8） */
export const AIR_NOISE_K = 0.8;
/** 噪音圈住宅幸福惩罚上限 */
export const AIR_NOISE_MAX = 5;
/** 每条在飞航线的游客乘数（航线直通远方，客源不再只靠口碑） */
export const AIR_TOUR_K = 0.12;
/** 每座机场的空运出口吞吐（件/分）：货机腹舱也是一条出海口 */
export const AIR_EXP_T = 3.0;
/** 机场落成的交通指数加成（机场大巴与高速引道） */
export const AIR_BONUS = 8;
/** 航线总数 = 基础 1 + 姊妹城 3 + 远洋 1 */
export const AIR_ROUTE_N = 5;
/** 航班间隔（游戏小时/条航线）：8 小时一班，节奏与开埠日历合拍 */
export const AIR_FLIGHT_H = 8;
/** 每班旅客基数（人） */
export const AIR_PAX_BASE = 60;
/** 每班旅客随人口增长系数（城市越大，客座越满） */
export const AIR_PAX_POP = 0.2;
/** 远洋枢纽线开通的人口门槛 */
export const AIR_FAR_POP = 500;
/** 姊妹城国际航线的好感门槛（与 v37 结好门槛一致：正式结为姊妹之城才通航） */
export const AIR_SIS_REL = 60;
/** 累计旅客吞吐里程碑（成就口径：人次） */
export const AIR_PAX_GOAL = 5000;

export type AirAnchor = { x: number; y: number };

// ------------------------------------------------------------
// 航线表：五条航线各有出处（基础/姊妹城/远洋），开通条件在 tycoon 侧判定
// ------------------------------------------------------------

export type AirRouteDef = {
  id: string;         // 'r0'..'r4'
  kind: 'base' | 'sister' | 'far';
  desc: string;       // 面板展示（目的地与开通条件）
};

export const AIR_ROUTE_DEFS: AirRouteDef[] = [
  { id: 'r0', kind: 'base', desc: '邻省都会线 —— 航站楼落成即开的骨干航线' },
  { id: 'r1', kind: 'sister', desc: '姊妹城国际航线①—— 好感 ≥60 正式结好即通航' },
  { id: 'r2', kind: 'sister', desc: '姊妹城国际航线②—— 好感 ≥60 正式结好即通航' },
  { id: 'r3', kind: 'sister', desc: '姊妹城国际航线③—— 好感 ≥60 正式结好即通航' },
  { id: 'r4', kind: 'far', desc: '远洋枢纽线 —— 人口 ≥500 的都会级门户' },
];

/** 航线开通判定（纯函数）：机场在城是总开关；姊妹城线看好感、远洋线看人口 */
export function airRouteOpen(
  def: AirRouteDef, hasAir: boolean, pop: number, sisRel: number[],
): boolean {
  if (!hasAir) return false;
  if (def.kind === 'base') return true;
  if (def.kind === 'far') return pop >= AIR_FAR_POP;
  const rel = sisRel[Number(def.id.slice(1)) - 1] ?? 0;
  return rel >= AIR_SIS_REL;
}

/** 每班旅客数（人）：城市越大客座越满 —— 60 + 人口×0.2，取整 */
export function paxPerFlight(pop: number): number {
  return Math.round(AIR_PAX_BASE + pop * AIR_PAX_POP);
}

/** 每条在飞航线的游客乘数：1 + 0.12 × 航线数（5 条全开 ×1.6） */
export function airTourMult(routes: number): number {
  return 1 + AIR_TOUR_K * Math.max(0, routes);
}

/** 商圈覆盖判定（纯函数）：建筑锚点距机场 ≤ SERVE_R 即在商圈内 */
export function airCovered(x: number, y: number, anchor: AirAnchor): boolean {
  return Math.max(Math.abs(x - anchor.x), Math.abs(y - anchor.y)) <= AIR_SERVE_R;
}

/** 噪音圈判定（纯函数）：建筑锚点距机场 ≤ NOISE_R 即在噪音圈内 */
export function airNoisy(x: number, y: number, anchor: AirAnchor): boolean {
  return Math.max(Math.abs(x - anchor.x), Math.abs(y - anchor.y)) <= AIR_NOISE_R;
}

/** 噪音圈住宅幸福惩罚（每栋 −0.8，取整，至多 −5） */
export function noiseHapOf(resN: number): number {
  return resN > 0 ? Math.min(AIR_NOISE_MAX, Math.round(resN * AIR_NOISE_K)) : 0;
}

/** 空运出口吞吐（件/分）：每座机场 +3.0（腹舱货运） */
export function airExpT(airports: number): number {
  return AIR_EXP_T * Math.max(0, airports);
}
