// ============================================================
// metro.ts — v41 轨道时代·地下铁（纯函数模块）
//
// 地铁网络与既有覆盖场不同：它不是「设施自身辐射」，而是
// 「沿链组网」—— 车辆段是全线锚点，地铁站沿切比雪夫 CHAIN_R
// 内逐站续链（站与站手拉手也能把线路送出很远），
// 只有接入车辆段的车站才通车，并以 SERVE_R 通勤圈服务商铺与住宅。
// 通勤圈只 buff 不打折：没有地铁的老街区照旧营生。
// 全部为纯函数（rnd/依赖零注入），bun 直测与引擎共用。
// ============================================================

/** 链距（切比雪夫，自锚点起算）：车辆段↔车站、车站↔车站逐站续链 */
export const METRO_CHAIN_R = 12;
/** 通勤圈半径（切比雪夫）：接入站服务范围内的商铺与住宅 */
export const METRO_SERVE_R = 5;
/** 通勤圈商铺收入乘数（站口出就是店门口，客流坐地铁来） */
export const METRO_EARN_K = 1.06;
/** 通勤圈住宅幸福加成（每栋 +1.2） */
export const METRO_HAP_K = 1.2;
/** 通勤圈住宅幸福加成上限 */
export const METRO_HAP_MAX = 7;
/** 成网最少接入站数（≥2 站即通车，交通加成才开始计） */
export const METRO_BONUS_MIN = 2;
/** 每接入站的交通指数加成（地下动脉分担地面车流） */
export const METRO_BONUS_K = 5;
/** 交通加成上限 */
export const METRO_BONUS_MAX = 20;

export type MetroNode = { x: number; y: number };

/** 两锚点切比雪夫距离是否在链距内 */
const near = (a: MetroNode, b: MetroNode): boolean =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= METRO_CHAIN_R;

/** 线网判定（纯函数）：depots 为锚点，站点沿链 BFS 逐站续链。
 *  返回「接入车辆段」的站点下标集合（stops 的下标）；
 *  未接入的车站只是摆设 —— 沿链 12 格内既够不着车辆段也够不着任何已接入站 */
export function metroNetOf(depots: MetroNode[], stops: MetroNode[]): Set<number> {
  const conn = new Set<number>();
  if (!depots.length || !stops.length) return conn;
  const queue: number[] = [];
  stops.forEach((st, k) => {
    if (depots.some(d => near(d, st))) { conn.add(k); queue.push(k); }
  });
  while (queue.length) {
    const cur = stops[queue.shift()!];
    stops.forEach((st, k) => {
      if (!conn.has(k) && near(cur, st)) { conn.add(k); queue.push(k); }
    });
  }
  return conn;
}

/** 通勤圈覆盖判定（纯函数）：建筑锚点距任一「接入站」≤ SERVE_R 即在圈内 */
export function metroCovered(x: number, y: number, stops: MetroNode[]): boolean {
  for (const st of stops) {
    if (Math.max(Math.abs(x - st.x), Math.abs(y - st.y)) <= METRO_SERVE_R) return true;
  }
  return false;
}

/** 接入站群的交通加成（两站成网起算，每站 +5 至多 +20；孤立车站不计） */
export function metroBonusOf(conn: number): number {
  return conn >= METRO_BONUS_MIN ? Math.min(METRO_BONUS_MAX, conn * METRO_BONUS_K) : 0;
}

/** 通勤圈住宅幸福加成（每栋 +1.2，四舍五入，至多 +7） */
export function metroHapOf(resN: number): number {
  return Math.min(METRO_HAP_MAX, Math.round(resN * METRO_HAP_K));
}
