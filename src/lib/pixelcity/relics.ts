// ============================================================
// relics.ts — v38 厚土藏珍：考古之城（文物出土与博物馆策展）
//   每购一块新领地，工队都可能从厚土里磕出一件先民遗物 ——
//   陶土四器 / 青铜四器 / 玉石四器共 12 件，寻常、珍稀、国宝三档；
//   出土即入册「出土图鉴」，博物馆在城时自动开馆展出：
//   展出的每一件都为文化供给与城市吸引力添一笔，
//   国宝入馆还是镇馆之宝（游客乘数），集齐 12 件全展出满馆琳琅。
//   本模块不依赖 tycoon（随机源由外部传入，避免循环引用）。
// ============================================================

/** 文物定义（随档保存出土顺序；展出状态随博物馆在城自动生效） */
export type RelicDef = {
  id: string;                       // 'r01'..'r12'
  name: string;
  set: 'pottery' | 'bronze' | 'jade';
  era: string;                      // 年代 flavor（虚构拟古，不影射真实考古）
  note: string;                     // 图鉴 flavor
  rare: 0 | 1 | 2;                  // 0 寻常 / 1 珍稀 / 2 国宝
  icon: string;                     // icons.ts
};

// ------------------------------------------------------------
// 调度与结算常数
// ------------------------------------------------------------

export const RELIC_DIG_P = 0.22;        // 购一块新领地的出土概率（厚土有缘，见者有份）
export const RELIC_CULT = [1.5, 3, 6] as const;   // 展出文化供给：寻常/珍稀/国宝
export const RELIC_ATTR = [2, 4, 8] as const;     // 展出吸引力加成
export const RELIC_TOUR_K = 0.02;       // 每件国宝游客乘数（镇馆之宝）
export const RELIC_TOUR_MAX = 0.06;     // 国宝游客乘数上限
export const RELIC_HAP_FULL = 2;        // 12 件全展出的全城幸福加成（满馆琳琅）

// ------------------------------------------------------------
// 套系与文物表（3 套系 × 4 件 = 12 件）
// ------------------------------------------------------------

export const RELIC_SETS: Array<{ id: 'pottery' | 'bronze' | 'jade'; name: string; note: string }> = [
  { id: 'pottery', name: '陶土四器', note: '灶火与泥土捏出的日常 —— 先民的日子都烧在里头' },
  { id: 'bronze', name: '青铜四器', note: '钟鸣鼎食的旧岁月 —— 铜绿底下是当年的排场' },
  { id: 'jade', name: '玉石四器', note: '温润和光的君子佩 —— 刻得动石头的是岁月' },
];

export const RELICS: RelicDef[] = [
  { id: 'r01', name: '灰陶炊罐', set: 'pottery', era: '新石器早期', rare: 0, icon: 'box',
    note: '罐底还留着烟炱 —— 第一锅粥的香气隔着几千年飘过来。' },
  { id: 'r02', name: '陶屋模型', set: 'pottery', era: '新石器中期', rare: 0, icon: 'land',
    note: '捏得歪歪扭扭的小房子，门缝里还有一只拇指大的陶犬。' },
  { id: 'r03', name: '兽面瓦当', set: 'pottery', era: '早期城邦', rare: 1, icon: 'rock',
    note: '檐角的一枚兽面，瞪了千年，还在替旧宅看家。' },
  { id: 'r04', name: '陶俑立像', set: 'pottery', era: '早期城邦', rare: 1, icon: 'person',
    note: '千人千面里的一张脸 —— 不知道是谁，但笑得很老实。' },
  { id: 'r05', name: '青铜爵', set: 'bronze', era: '铜器时代', rare: 0, icon: 'flask',
    note: '三足两柱，爵中残酒早化尘土，碰杯声却像还在耳边。' },
  { id: 'r06', name: '昭明铜镜', set: 'bronze', era: '铜器时代', rare: 0, icon: 'coin',
    note: '镜面锈成一团墨绿云纹 —— 照过谁的容颜，已无从对证。' },
  { id: 'r07', name: '编钟一枚', set: 'bronze', era: '礼乐之世', rare: 1, icon: 'fest',
    note: '编钟只剩一枚，敲一下，余音里的宴席散了又聚。' },
  { id: 'r08', name: '兽面纹铜鼎', set: 'bronze', era: '礼乐之世', rare: 2, icon: 'medal',
    note: '鼎足沉厚、纹路森然 —— 国之重器出土之日，满城屏息。' },
  { id: 'r09', name: '谷纹玉璧', set: 'jade', era: '礼乐之世', rare: 0, icon: 'sun',
    note: '一圈谷芽纹排得整整齐齐，像把一季的收成刻进了玉里。' },
  { id: 'r10', name: '玉琮', set: 'jade', era: '早期城邦', rare: 1, icon: 'drop',
    note: '外方内圆 —— 先民把天与地都握在这一方玉里。' },
  { id: 'r11', name: '甲骨残片', set: 'jade', era: '占卜之世', rare: 1, icon: 'book',
    note: '灼痕间刻着几道细纹 —— 问的是年成，是风雨，还是远行。' },
  { id: 'r12', name: '鎏金印玺', set: 'jade', era: '方国之世', rare: 2, icon: 'star',
    note: '鎏金未褪、印文如新 —— 一方金印，半部城史。' },
];

// ------------------------------------------------------------
// 纯函数
// ------------------------------------------------------------

/** 出土稀有度抽取（0 寻常 62% / 1 珍稀 30% / 2 国宝 8%） */
export function rollRelicRare(rnd: () => number = Math.random): 0 | 1 | 2 {
  const r = rnd();
  if (r < 0.62) return 0;
  if (r < 0.92) return 1;
  return 2;
}

/** 从未出土池中按稀有度抽一件（稀有档缺失则向寻常档回落；全出土返回 null） */
export function rollRelicId(got: string[], rnd: () => number = Math.random): string | null {
  const remain = RELICS.filter(x => !got.includes(x.id));
  if (!remain.length) return null;
  const want = rollRelicRare(rnd);
  for (const lv of [want, want === 0 ? 1 : want === 1 ? 0 : 1] as Array<0 | 1>) {
    const pool = remain.filter(x => x.rare === lv);
    if (pool.length) return pool[(rnd() * pool.length) | 0].id;
  }
  const low = remain.filter(x => x.rare === 0);
  return (low.length ? low : remain)[(rnd() * (low.length || remain.length)) | 0].id;
}

/** 博物馆策展加成（博物馆在城时全展出；不在城则文物在库房零加成） */
export function relicBonusOf(got: string[], hasMuseum: boolean): {
  cul: number; at: number; tourK: number; hap: number; exN: number;
} {
  if (!hasMuseum || !got.length) return { cul: 0, at: 0, tourK: 1, hap: 0, exN: 0 };
  let cul = 0, at = 0, gems = 0;
  for (const id of got) {
    const d = RELICS.find(x => x.id === id);
    if (!d) continue;
    cul += RELIC_CULT[d.rare];
    at += RELIC_ATTR[d.rare];
    if (d.rare === 2) gems++;
  }
  const tourK = 1 + Math.min(RELIC_TOUR_MAX, gems * RELIC_TOUR_K);
  const hap = got.length >= RELICS.length ? RELIC_HAP_FULL : 0;
  return { cul, at, tourK, hap, exN: got.length };
}

/** 套系集齐判定 */
export function relicSetDone(got: string[], setId: 'pottery' | 'bronze' | 'jade'): boolean {
  return RELICS.filter(x => x.set === setId).every(x => got.includes(x.id));
}

/** 稀有度档位名 */
export function relicRareName(rare: 0 | 1 | 2): string {
  return rare === 2 ? '国宝' : rare === 1 ? '珍稀' : '寻常';
}
