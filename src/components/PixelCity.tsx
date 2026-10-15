'use client';

// ============================================================
// PixelCity.tsx — 像素都市 · 界面壳与交互面板
//   桌面：右上建造中心（整板 + 四分组均可折叠）/ 左侧浮动工具条
//   移动：底部抽屉 + 横滚工具条 + 大触控目标
//   收缩状态 / 行人开关 持久化到 localStorage
// ============================================================

import {
  useEffect, useRef, useState, useCallback, useSyncExternalStore,
} from 'react';
import '@/lib/pixelcity/pixelcity.css';
import { Engine, type Tool } from '@/lib/pixelcity/engine';
import { Beeper } from '@/lib/pixelcity/audio';
import { CATALOG, defById, type Cat } from '@/lib/pixelcity/catalog';
import { PALETTE } from '@/lib/pixelcity/palette';
import { iconURI } from '@/lib/pixelcity/icons';

const ICON_NAMES = [
  'undo', 'redo', 'zoomin', 'zoomout', 'sound', 'soundoff',
  'view', 'grass', 'water', 'sand', 'farm', 'rock', 'tree', 'road',
  'house', 'shop', 'factory', 'park', 'doze', 'city',
  'save', 'random', 'exportp', 'atlas',
  'person', 'personoff', 'menu',
  'snow', 'flower', 'dry', 'swamp', 'autumn',
];

type Phase = 'loading' | 'ready';

type CellItem = { id: string; v: number; name: string; uri: string };

type SubCat = Cat | 'terr';

const CAT_META: Array<{ key: Cat; name: string; icon: string }> = [
  { key: 'res', name: '住宅', icon: 'house' },
  { key: 'com', name: '商业', icon: 'shop' },
  { key: 'ind', name: '工业', icon: 'factory' },
  { key: 'civ', name: '公共', icon: 'park' },
];

const TERR_OPTS: Array<{ k: number; label: string; icon: string; desc: string }> = [
  { k: 0, label: '草地', icon: 'grass', desc: '基础绿地，可长树，可铺路' },
  { k: 1, label: '水域', icon: 'water', desc: '河流湖泊，会淹没地上物' },
  { k: 2, label: '沙地', icon: 'sand', desc: '海岸沙滩，适合灯塔' },
  { k: 3, label: '耕地', icon: 'farm', desc: '金黄/翠绿作物条田拼布' },
  { k: 4, label: '岩石', icon: 'rock', desc: '碎石荒原与孤立巨石' },
  { k: 5, label: '雪地', icon: 'snow', desc: '北国雪原：岸冰、雪堆与松林' },
  { k: 6, label: '花田', icon: 'flower', desc: '五彩花畦，浪漫田园' },
  { k: 7, label: '荒漠', icon: 'dry', desc: '龟裂旱地戈壁，几乎不可开发' },
  { k: 8, label: '沼泽', icon: 'swamp', desc: '苔藓水洼湿地，保留野趣' },
  { k: 9, label: '秋原', icon: 'autumn', desc: '金秋草原，红叶点点' },
];

/** 一键城市密度档位 */
const DENSITIES: Array<{ v: number; label: string; desc: string }> = [
  { v: 0.55, label: '疏朗', desc: '低密度：大留白 + 更多绿树' },
  { v: 0.8, label: '适中', desc: '推荐密度：疏密有致' },
  { v: 1.05, label: '繁华', desc: '高密度：接近无空隙的都市' },
];

const PED_STEP = 20;
const PED_MAX = 300;

const TOOLBAR: Array<{ icon: string; label: string; tool: Tool; cat?: Cat; hot: string }> = [
  { icon: 'view', label: '观察', tool: { t: 'view' }, hot: '1' },
  { icon: 'tree', label: '植树', tool: { t: 'tree' }, hot: '2' },
  { icon: 'road', label: '道路', tool: { t: 'road' }, hot: '3' },
  { icon: 'grass', label: '地形', tool: { t: 'terr', k: 0 }, hot: '4' },
  { icon: 'house', label: '住宅', tool: { t: 'build', id: 'house', variant: 0 }, cat: 'res', hot: '5' },
  { icon: 'shop', label: '商业', tool: { t: 'build', id: 'shop', variant: 0 }, cat: 'com', hot: '6' },
  { icon: 'factory', label: '工业', tool: { t: 'build', id: 'factory', variant: 0 }, cat: 'ind', hot: '7' },
  { icon: 'park', label: '公共', tool: { t: 'build', id: 'park', variant: 0 }, cat: 'civ', hot: '8' },
  { icon: 'doze', label: '推土', tool: { t: 'doze' }, hot: '9' },
];

// ---------------- 界面收缩状态（持久化） ----------------

type UiState = {
  panel: boolean;    // 桌面右侧建造中心
  toolbar: boolean;  // 浮动工具条
  build: boolean;    // 建造面板分组
  mini: boolean;     // 小地图分组
  cityops: boolean;  // 市政操作分组
  about: boolean;    // 关于分组
  drawer: boolean;   // 移动端抽屉
  crowds: boolean;   // 行人 / 车辆
  min: boolean;      // 标题栏最小化
  pedsAuto: boolean; // 行人数量：自动 / 手动
  pedsN: number;     // 手动行人目标数
  density: number;   // 一键城市密度
  dayAuto: boolean;  // 昼夜：自动循环 / 手动定格
  daySpeed: number;  // 自动循环速度 ×1/×2/×4
  dayT: number;      // 上次保存的时刻（0-24）
};

const UI_DEFAULT: UiState = {
  panel: true, toolbar: true, build: true, mini: true,
  cityops: true, about: false, drawer: false, crowds: true, min: false,
  pedsAuto: true, pedsN: 100, density: 0.8,
  dayAuto: true, daySpeed: 1, dayT: 10,
};

const UI_KEY = 'pxc_ui_v1';

function loadUi(): UiState {
  try {
    const raw = localStorage.getItem(UI_KEY);
    if (raw) return { ...UI_DEFAULT, ...(JSON.parse(raw) as Partial<UiState>) };
  } catch { /* 忽略 */ }
  return { ...UI_DEFAULT };
}

// ---- 外部 UI 状态存储（localStorage 持久化，useSyncExternalStore 水合安全）----
let uiStore: UiState = (() => {
  try {
    const raw = localStorage.getItem(UI_KEY);
    if (raw) return { ...UI_DEFAULT, ...(JSON.parse(raw) as Partial<UiState>) };
  } catch { /* SSR / 数据损坏时用默认值 */ }
  return { ...UI_DEFAULT };
})();
const uiSubs = new Set<() => void>();

function setUiStore(next: (u: UiState) => UiState): void {
  uiStore = next(uiStore);
  try { localStorage.setItem(UI_KEY, JSON.stringify(uiStore)); } catch { /* 忽略 */ }
  for (const fn of uiSubs) fn();
}

function useUiState(): [UiState, typeof setUiStore] {
  const subscribe = useCallback((cb: () => void) => {
    uiSubs.add(cb);
    return () => { uiSubs.delete(cb); };
  }, []);
  const snap = useSyncExternalStore(subscribe, () => uiStore, () => UI_DEFAULT);
  return [snap, setUiStore];
}

function toolHint(t: Tool): string {
  switch (t.t) {
    case 'view': return '拖动平移 · 滚轮/双指缩放 · 空格居中';
    case 'terr': return `按住拖动画画「${TERR_OPTS[t.k]?.label ?? '地形'}」（水域会淹没地上物）`;
    case 'tree': return '点击或拖动，种下随机小树（共 6 种，含樱花与棕榈）';
    case 'road': return '按住拖出路网，转角自动拼接';
    case 'doze': return '点击拆除：整栋建筑 / 树木 / 道路';
    case 'build': {
      const d = defById(t.id);
      return `点击放置「${d.name}」占地 ${d.w}×${d.h}${d.pop ? ` · 容纳 ${d.pop} 人` : ''}`;
    }
  }
}

export default function PixelCity() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [prog, setProg] = useState({ frac: 0, label: '初始化调色板' });
  const [tool, setTool] = useState<Tool>({ t: 'view' });
  const [subCat, setSubCat] = useState<SubCat>('terr');
  const [stats, setStats] = useState({ pop: 0, buildings: 0, roads: 0, trees: 0 });
  const [crowd, setCrowd] = useState({ peds: 0, cars: 0, pets: 0 });
  const [hover, setHover] = useState<{ tx: number; ty: number } | null>(null);
  const [fps, setFps] = useState(0);
  const [zoom, setZoom] = useState(2);
  const [modal, setModal] = useState<'none' | 'save' | 'help'>('none');
  const [toast, setToast] = useState<{ id: number; msg: string } | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [slotMeta, setSlotMeta] = useState<Array<{ time: string; pop: number } | null>>([null, null, null]);
  const [cellsByCat, setCellsByCat] = useState<Record<string, CellItem[]>>({});
  const [iconSrc, setIconSrc] = useState<Record<string, string>>({});
  const [clock, setClock] = useState({ text: '10:00', ph: '昼' });
  const [ui] = useUiState();
  const [isMobile, setIsMobile] = useState(false);

  const engineRef = useRef<Engine | null>(null);
  const beeperRef = useRef<Beeper | null>(null);
  const viewRef = useRef<HTMLCanvasElement | null>(null);
  const miniRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const toastTimer = useRef<number>(0);
  const clockTick = useRef(0);

  const say = useCallback((msg: string) => {
    setToast({ id: Date.now(), msg });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2400);
  }, []);

  const toggle = useCallback((k: keyof UiState) => {
    setUiStore(u => ({ ...u, [k]: !u[k] }));
    beeperRef.current?.play('click');
  }, []);

  /** 小地图挂载点（桌面侧栏 / 移动抽屉二选一），断点切换时重绑 */
  const miniRefCb = useCallback((cv: HTMLCanvasElement | null) => {
    miniRef.current = cv;
    if (cv) engineRef.current?.rebindMini(cv);
  }, []);

  // ---------------- 断点检测 ----------------
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 820px)');
    const upd = () => setIsMobile(mq.matches);
    upd();
    mq.addEventListener('change', upd);
    return () => mq.removeEventListener('change', upd);
  }, []);

  // ---------------- 引擎生命周期 ----------------
  useEffect(() => {
    const beeper = new Beeper();
    const eng = new Engine(beeper);
    engineRef.current = eng;
    beeperRef.current = beeper;
    eng.hooks = {
      onStats: setStats,
      onHover: (tx, ty) => setHover({ tx, ty }),
      onZoom: setZoom,
      onTool: setTool,
      onFps: setFps,
    };
    let disposed = false;

    void eng.init((frac, label) => setProg({ frac, label })).then(() => {
      if (disposed || !viewRef.current) return;
      const u0 = loadUi();
      eng.setCrowds(u0.crowds);
      eng.setPedTarget(u0.pedsAuto ?? true, u0.pedsN ?? 100);
      eng.cityDensity = u0.density ?? 0.8;
      eng.setTimeOfDay(u0.dayT ?? 10);
      eng.setDayNight(u0.dayAuto ?? true, u0.daySpeed ?? 1);
      setClock({ text: eng.clockText(), ph: eng.phaseChar() });
      eng.attach(viewRef.current, miniRef.current);
      // 调试句柄（控制台观察引擎状态用）
      (window as unknown as { __pxc: unknown }).__pxc = eng;
      setStats(eng.map.stats());
      const acc: Record<string, CellItem[]> = { res: [], com: [], ind: [], civ: [] };
      for (const d of CATALOG) {
        for (let v = 0; v < d.variants; v++) {
          acc[d.cat].push({
            id: d.id, v, name: d.name,
            uri: eng.book.get(d.id, v).thumb.toDataURL('image/png'),
          });
        }
      }
      setCellsByCat(acc);
      const iuMap: Record<string, string> = {};
      for (const n of ICON_NAMES) iuMap[n] = iconURI(n);
      setIconSrc(iuMap);
      setPhase('ready');
      beeper.play('open');
    });

    const ro = new ResizeObserver(() => eng.resize());
    if (wrapRef.current) ro.observe(wrapRef.current);

    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.ctrlKey || e.metaKey || e.altKey) return;
      const eng2 = engineRef.current;
      if (!eng2) return;
      if (e.code === 'KeyG') {
        e.preventDefault();
        const rep = eng2.generateCity();
        if (rep) say(`一键城市：${rep.buildings} 栋 · 人口 ${rep.pop}`);
        else say('可用平地不足，先换个地形试试');
        return;
      }
      const map: Record<string, Tool> = {
        Digit1: { t: 'view' },
        Digit2: { t: 'tree' },
        Digit3: { t: 'road' },
        Digit4: { t: 'terr', k: 0 },
        Digit5: { t: 'build', id: 'house', variant: 0 },
        Digit6: { t: 'build', id: 'shop', variant: 0 },
        Digit7: { t: 'build', id: 'factory', variant: 0 },
        Digit8: { t: 'build', id: 'park', variant: 0 },
        Digit9: { t: 'doze' },
      };
      const t = map[e.code];
      if (t) {
        e.preventDefault();
        if (t.t === 'build') {
          const cat = defById(t.id).cat;
          setSubCat(cat);
        }
        if (t.t === 'terr') setSubCat('terr');
        eng2.setTool(t);
      }
    };
    window.addEventListener('keydown', onKey);

    const crowdTimer = window.setInterval(() => {
      const eng3 = engineRef.current;
      if (eng3) {
        setCrowd(eng3.crowdCount());
        setClock({ text: eng3.clockText(), ph: eng3.phaseChar() });
        // 每分钟把当前时刻回写持久化（供下次启动恢复）
        clockTick.current = (clockTick.current + 1) % 60;
        if (clockTick.current === 0) {
          setUiStore(u => (Math.abs((u.dayT ?? 10) - eng3.timeOfDay) < 0.02 ? u : { ...u, dayT: eng3.timeOfDay }));
        }
      }
    }, 1000);

    return () => {
      disposed = true;
      ro.disconnect();
      window.removeEventListener('keydown', onKey);
      window.clearInterval(crowdTimer);
      window.clearTimeout(toastTimer.current);
      eng.destroy();
    };
  }, [say]);

  // ---------------- 目录数据 ----------------
  const cells = subCat === 'terr' ? [] : cellsByCat[subCat] ?? [];
  const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
  const iu = useCallback((n: string) => iconSrc[n] ?? BLANK, [iconSrc]);

  // ---------------- 交互 ----------------
  const pickTool = useCallback((t: Tool, cat?: SubCat) => {
    const eng = engineRef.current;
    if (!eng) return;
    if (cat) setSubCat(cat);
    eng.setTool(t);
    beeperRef.current?.play('click');
  }, []);

  const pickCell = useCallback((id: string, v: number) => {
    pickTool({ t: 'build', id, variant: v });
  }, [pickTool]);

  const openModal = useCallback((m: 'save' | 'help') => {
    if (m === 'save') {
      setSlotMeta([0, 1, 2].map(i => Engine.slotMeta(i)));
    }
    setModal(m);
    beeperRef.current?.play('click');
  }, []);

  const dl = useCallback((uri: string, name: string) => {
    const a = document.createElement('a');
    a.href = uri;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, []);

  const doGenCity = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    const rep = eng.generateCity();
    if (rep) say(`一键城市：${rep.buildings} 栋建筑 · 人口 ${rep.pop} · 道路 ${rep.roads} 格`);
    else say('可用平地不足，先换个地形试试');
  }, [say]);

  const toggleCrowds = useCallback(() => {
    setUiStore(u => {
      const next = { ...u, crowds: !u.crowds };
      engineRef.current?.setCrowds(next.crowds);
      beeperRef.current?.play('click');
      return next;
    });
  }, []);

  /** 行人数量：auto / 手动；n 可为绝对值或基于当前值的增量函数（避免连点丢步） */
  const setPeds = useCallback((auto: boolean, n: number | ((prev: number) => number)) => {
    setUiStore(u => {
      const base = typeof n === 'function' ? n(u.pedsN) : n;
      return { ...u, pedsAuto: auto, pedsN: Math.max(0, Math.min(PED_MAX, Math.round(base))) };
    });
    // setUiStore 同步更新模块级 uiStore，这里读到的已是最终值
    engineRef.current?.setPedTarget(uiStore.pedsAuto, uiStore.pedsN);
    beeperRef.current?.play('click');
  }, []);

  /** 一键城市密度（对下一次生成生效） */
  const setDensity = useCallback((v: number) => {
    setUiStore(u => ({ ...u, density: v }));
    if (engineRef.current) engineRef.current.cityDensity = v;
    const d = DENSITIES.find(x => x.v === v);
    beeperRef.current?.play('click');
    if (d) say(`密度已设为「${d.label}」，点「一键城市」生效`);
  }, [say]);

  /** 昼夜：自动循环开关与倍速 */
  const setDayNight = useCallback((auto: boolean, speed: number) => {
    setUiStore(u => ({ ...u, dayAuto: auto, daySpeed: speed }));
    engineRef.current?.setDayNight(auto, speed);
    beeperRef.current?.play('click');
  }, []);

  /** 昼夜：跳转时刻 */
  const jumpTime = useCallback((h: number) => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.setTimeOfDay(h);
    setClock({ text: eng.clockText(), ph: eng.phaseChar() });
    setUiStore(u => ({ ...u, dayT: h }));
    beeperRef.current?.play('click');
  }, []);

  const doSave = (i: number) => {
    const eng = engineRef.current;
    if (!eng) return;
    if (eng.saveSlot(i)) {
      say(`已保存到存档位 ${i + 1}`);
      setSlotMeta([0, 1, 2].map(k => Engine.slotMeta(k)));
    } else say('保存失败：浏览器存储不可用');
  };
  const doLoad = (i: number) => {
    const eng = engineRef.current;
    if (!eng) return;
    if (eng.loadSlot(i)) {
      say(`已读取存档 ${i + 1}`);
      setModal('none');
    } else say('该存档位是空的');
  };
  const doDelete = (i: number) => {
    try {
      localStorage.removeItem(Engine.SLOT_KEY[i]);
      localStorage.removeItem(`pxc_meta${i + 1}`);
      setSlotMeta([0, 1, 2].map(k => Engine.slotMeta(k)));
      say(`存档位 ${i + 1} 已删除`);
    } catch { /* 忽略 */ }
  };

  const curDef = tool.t === 'build' ? defById(tool.id) : null;
  const hint = toolHint(tool);

  // ---------------- 共用分组 ----------------

  const buildGroup = (
    <div className={`pxc-group${ui.build ? '' : ' closed'}`}>
      <button className="pxc-ghead" onClick={() => toggle('build')} aria-expanded={ui.build}>
        <span>建 造 面 板</span><i>{ui.build ? '▾' : '▸'}</i>
      </button>
      {ui.build && (
        <div className="pxc-gbody">
          <div className="pxc-tabs" role="tablist">
            <button role="tab" aria-selected={subCat === 'terr'}
              className={subCat === 'terr' ? 'on' : ''}
              onClick={() => { setSubCat('terr'); beeperRef.current?.play('click'); }}>
              地形
            </button>
            {CAT_META.map(c => (
              <button key={c.key} role="tab" aria-selected={subCat === c.key}
                className={subCat === c.key ? 'on' : ''}
                onClick={() => { setSubCat(c.key); beeperRef.current?.play('click'); }}>
                {c.name}
              </button>
            ))}
          </div>
          {subCat === 'terr' ? (
            <div className="pxc-opts" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
              {TERR_OPTS.map(o => {
                const on = tool.t === 'terr' && tool.k === o.k;
                return (
                  <button key={o.k} className={`pxc-opt${on ? ' on' : ''}`}
                    title={o.desc} aria-label={o.label}
                    onClick={() => pickTool({ t: 'terr', k: o.k }, 'terr')}>
                    <img src={iu(o.icon)} alt="" />
                    <span>{o.label}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="pxc-grid" role="grid" aria-label="建筑变体">
              {cells.map(c => {
                const on = tool.t === 'build' && tool.id === c.id && tool.variant === c.v;
                const multi = defById(c.id).variants > 1;
                return (
                  <button key={`${c.id}#${c.v}`} className={`pxc-cell${on ? ' on' : ''}`}
                    title={`${c.name}${multi ? ` · 变体 ${c.v + 1}` : ''}`}
                    aria-label={`${c.name}${multi ? `变体${c.v + 1}` : ''}`}
                    onClick={() => pickCell(c.id, c.v)}>
                    <img src={c.uri} alt={c.name} />
                    <span className="pxc-cname">{c.name}{multi ? `·${c.v + 1}` : ''}</span>
                  </button>
                );
              })}
            </div>
          )}
          <div className="pxc-info">
            {tool.t === 'terr'
              ? <><b>{TERR_OPTS[tool.k]?.label ?? '地形'}</b><span>{TERR_OPTS[tool.k]?.desc ?? ''}</span></>
              : curDef
                ? <><b>{curDef.name}</b><span>{curDef.desc}</span></>
                : <span>选择地形或建筑，开始建造你的城市（G 键一键城市）</span>}
          </div>
        </div>
      )}
    </div>
  );

  const miniGroup = (
    <div className={`pxc-group${ui.mini ? '' : ' closed'}`}>
      <button className="pxc-ghead" onClick={() => toggle('mini')} aria-expanded={ui.mini}>
        <span>小 地 图</span><i>{ui.mini ? '▾' : '▸'}</i>
      </button>
      {ui.mini && (
        <div className="pxc-gbody">
          <canvas ref={miniRefCb} className="pxc-mini" aria-label="小地图" />
        </div>
      )}
    </div>
  );

  const cityOpsGroup = (
    <div className={`pxc-group${ui.cityops ? '' : ' closed'}`}>
      <button className="pxc-ghead" onClick={() => toggle('cityops')} aria-expanded={ui.cityops}>
        <span>市 政 操 作</span><i>{ui.cityops ? '▾' : '▸'}</i>
      </button>
      {ui.cityops && (
        <div className="pxc-gbody">
          <div className="pxc-row">
            <button className="pxc-btn primary" title="一键生成整座城市 (G)" onClick={doGenCity}>
              <img src={iu('city')} alt="" />一键城市
            </button>
            <button className="pxc-btn" onClick={() => { engineRef.current?.randomMap(); }}>
              <img src={iu('random')} alt="" />随机地图
            </button>
            <button className="pxc-btn" onClick={() => { engineRef.current?.clearMap(); }}>
              <img src={iu('doze')} alt="" />清空
            </button>
          </div>
          <div className="pxc-crowdrow">
            <span className="pxc-lbl">密度</span>
            {DENSITIES.map(d => (
              <button key={d.label}
                className={`pxc-btn mini${Math.abs(ui.density - d.v) < 0.01 ? ' on' : ''}`}
                title={`${d.desc}（对下一次「一键城市」生效）`}
                onClick={() => setDensity(d.v)}>
                {d.label}
              </button>
            ))}
          </div>
          <div className="pxc-crowdrow">
            <span className="pxc-lbl">行人</span>
            <button
              className={`pxc-btn mini${ui.pedsAuto ? ' on' : ''}`}
              title={ui.pedsAuto ? '自动：行人随人口增长（上限 220；夜间自动回落）' : '点此恢复自动（随人口）'}
              onClick={() => setPeds(!ui.pedsAuto, ui.pedsN)}>
              自动
            </button>
            <button className="pxc-btn mini" aria-label="减少行人"
              disabled={ui.pedsAuto || ui.pedsN <= 0}
              onClick={() => setPeds(false, prev => prev - PED_STEP)}>
              −
            </button>
            <span className="pxc-num" title="当前行人目标数（含职业角色；宠物另计）">
              {ui.pedsAuto ? `自动·${crowd.peds}${crowd.pets ? `+${crowd.pets}宠` : ''}` : `${ui.pedsN}`}
            </span>
            <button className="pxc-btn mini" aria-label="增加行人"
              disabled={ui.pedsAuto || ui.pedsN >= PED_MAX}
              onClick={() => setPeds(false, prev => prev + PED_STEP)}>
              ＋
            </button>
          </div>
          <div className="pxc-crowdrow">
            <span className="pxc-lbl">昼夜</span>
            <button
              className={`pxc-btn mini${ui.dayAuto ? ' on' : ''}`}
              title={ui.dayAuto ? '自动循环（×1 = 8 分钟一天）' : '手动定格：点此恢复自动循环'}
              onClick={() => setDayNight(!ui.dayAuto, ui.daySpeed || 1)}>
              {ui.dayAuto ? '自动' : '手动'}
            </button>
            <span className="pxc-num" title="当前时刻">{clock.text} {clock.ph}</span>
          </div>
          <div className="pxc-crowdrow">
            <span className="pxc-lbl">时速</span>
            {[1, 2, 4].map(s => (
              <button key={s}
                className={`pxc-btn mini${ui.dayAuto && (ui.daySpeed || 1) === s ? ' on' : ''}`}
                disabled={!ui.dayAuto}
                title={`昼夜循环速度 ×${s}（一天 ${s === 1 ? '8' : s === 2 ? '4' : '2'} 分钟）`}
                onClick={() => setDayNight(true, s)}>
                ×{s}
              </button>
            ))}
            <span className="pxc-lbl" style={{ marginLeft: 4 }}>场景</span>
            {([
              ['晨', 6.5, '清晨 06:30'], ['午', 12, '正午 12:00'],
              ['暮', 18.2, '黄昏 18:12'], ['夜', 22.5, '深夜 22:30'],
            ] as const).map(([ph, h, title]) => (
              <button key={ph} className="pxc-btn mini"
                title={`${title}（跳转时刻）`}
                onClick={() => jumpTime(h)}>
                {ph}
              </button>
            ))}
          </div>
          <div className="pxc-row" style={{ marginTop: 4 }}>
            <button className="pxc-btn" onClick={() => openModal('save')}>
              <img src={iu('save')} alt="" />存档…
            </button>
            <button className="pxc-btn" onClick={() => {
              const eng = engineRef.current;
              if (!eng) return;
              dl(eng.exportPNG(), `像素都市_${new Date().toISOString().slice(0, 10)}.png`);
              say('已导出画面快照 PNG');
            }}>
              <img src={iu('exportp')} alt="" />快照
            </button>
            <button className="pxc-btn" onClick={() => {
              const eng = engineRef.current;
              if (!eng) return;
              dl(eng.book.exportAtlas(), '像素都市_精灵图集.png');
              say('已导出全部精灵图集');
            }}>
              <img src={iu('atlas')} alt="" />图集
            </button>
          </div>
        </div>
      )}
    </div>
  );

  const aboutGroup = (
    <div className={`pxc-group${ui.about ? '' : ' closed'}`} style={{ marginBottom: 8 }}>
      <button className="pxc-ghead" onClick={() => toggle('about')} aria-expanded={ui.about}>
        <span>关 于</span><i>{ui.about ? '▾' : '▸'}</i>
      </button>
      {ui.about && (
        <div className="pxc-gbody">
          <div style={{ fontSize: 11, lineHeight: 1.7, color: '#3d434e' }}>
            一切画面均由代码程序化生成：{CATALOG.length} 类 {CATALOG.reduce((s, d) => s + d.variants, 0)} 变体建筑，
            256×256 大地图 · 10 种地形 · 一键城市（密度三档可调）·
            行人车辆（五职业 · 遛狗与流浪猫狗 · 结伴出行，智能寻路，数量可调）·
            昼夜循环（入夜点亮万家灯火、路灯与霓虹），
            经固定 2:1 等距正交投影离线光栅化为透明精灵，
            叠加 {PALETTE.length} 色有限色板、Bayer 有序抖动、
            扫描线与 CRT 暗角 —— 向 DOS/PC98 与 SimCity 致敬。
          </div>
        </div>
      )}
    </div>
  );

  // ---------------- 渲染 ----------------
  return (
    <div className={`pxc${isMobile ? ' m' : ''}${ui.min ? ' min' : ''}`}>
      {/* 标题栏 */}
      <div className="pxc-titlebar" onClick={ui.min ? () => toggle('min') : undefined}>
        <div className="pxc-logo" aria-hidden />
        {!ui.min && <h1>{isMobile ? '像素都市' : '像素都市 PIXEL CITY · 等距建造沙盒'}</h1>}
        {ui.min ? (
          <span className="pxc-minhint">像素都市 — 已最小化（点击还原）</span>
        ) : (
          <div className="pxc-tb-actions">
            {isMobile && (
              <button className="pxc-winbtn" title="打开建造中心" aria-label="打开建造中心"
                onClick={() => setUiStore(u => ({ ...u, drawer: true }))}>
                <img src={iu('menu')} alt="" width={12} height={12} />
              </button>
            )}
            {isMobile && (
              <button className="pxc-winbtn" title="一键城市" aria-label="一键城市" onClick={doGenCity}>
                <img src={iu('city')} alt="" width={12} height={12} />
              </button>
            )}
            <button className="pxc-winbtn" title="撤销 (Ctrl+Z)" aria-label="撤销"
              onClick={() => engineRef.current?.undo()}>
              <img src={iu('undo')} alt="" width={12} height={12} />
            </button>
            {!isMobile && (
              <button className="pxc-winbtn" title="重做 (Ctrl+Shift+Z)" aria-label="重做"
                onClick={() => engineRef.current?.redo()}>
                <img src={iu('redo')} alt="" width={12} height={12} />
              </button>
            )}
            <button className="pxc-winbtn" title="缩小 (−)" aria-label="缩小"
              onClick={() => engineRef.current?.cycleZoom(-1)}>
              <img src={iu('zoomout')} alt="" width={12} height={12} />
            </button>
            <button className="pxc-winbtn" title="放大 (+)" aria-label="放大"
              onClick={() => engineRef.current?.cycleZoom(1)}>
              <img src={iu('zoomin')} alt="" width={12} height={12} />
            </button>
            <button className={`pxc-winbtn${ui.crowds ? ' on' : ''}`}
              title={ui.crowds ? `行人车辆：开（行人 ${crowd.peds} · 宠物 ${crowd.pets} · 车辆 ${crowd.cars}）` : '行人车辆：关'}
              aria-label="行人车辆开关" onClick={toggleCrowds}>
              <img src={iu(ui.crowds ? 'person' : 'personoff')} alt="" width={12} height={12} />
            </button>
            <button className="pxc-winbtn" title="声音" aria-label="声音开关"
              onClick={() => {
                const b = beeperRef.current;
                if (!b) return;
                b.enabled = !b.enabled;
                setSoundOn(b.enabled);
                if (b.enabled) b.play('click');
              }}>
              <img src={iu(soundOn ? 'sound' : 'soundoff')} alt="" width={12} height={12} />
            </button>
            <button className="pxc-winbtn" title="帮助" aria-label="帮助"
              onClick={() => openModal('help')}>?</button>
            {!isMobile && (
              <>
                <button className="pxc-winbtn" title="最小化界面" aria-label="最小化界面"
                  onClick={() => toggle('min')}>─</button>
                <button className="pxc-winbtn" title="关闭" aria-label="关闭"
                  onClick={() => say('这座城市永远为你敞开大门')}>×</button>
              </>
            )}
          </div>
        )}
      </div>

      {/* 主体 */}
      <div className="pxc-main">
        <div className="pxc-screen" ref={wrapRef}>
          <canvas ref={viewRef} className="pxc-view" role="img"
            aria-label="等距城市画布：使用工具建造，右键拖动平移，滚轮或双指缩放" />
          <div className="pxc-crt" aria-hidden />

          {/* 工具条（可收缩） */}
          {ui.toolbar ? (
            <div className="pxc-toolbar" role="toolbar" aria-label="工具">
              {TOOLBAR.map(item => {
                let on = false;
                if (tool.t === item.tool.t) {
                  if (tool.t === 'build' && item.tool.t === 'build') {
                    on = defById(tool.id).cat === item.cat;
                  } else if (tool.t === 'terr' && item.tool.t === 'terr') {
                    on = tool.k === item.tool.k;
                  } else if (tool.t !== 'build' && tool.t !== 'terr') on = true;
                }
                return (
                  <button key={item.label} className={`pxc-tool${on ? ' on' : ''}`}
                    title={`${item.label} (${item.hot})`} aria-label={item.label}
                    onClick={() => {
                      if (item.tool.t === 'terr') setSubCat('terr');
                      pickTool(item.tool, item.cat ?? (item.tool.t === 'terr' ? 'terr' : undefined));
                    }}>
                    <img src={iu(item.icon)} alt="" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
              <button className="pxc-tool pxc-fold" title="收起工具条" aria-label="收起工具条"
                onClick={() => toggle('toolbar')}>◀</button>
            </div>
          ) : (
            <button className="pxc-tooltab" onClick={() => toggle('toolbar')}
              title="展开工具条" aria-label="展开工具条">▶<span>工具</span></button>
          )}

          <div className="pxc-badge">
            ZOOM ×{zoom} · {fps} FPS{ui.crowds ? ` · 行人 ${crowd.peds}${crowd.pets ? ` +${crowd.pets} 宠` : ''}` : ''}
          </div>

          {toast && <div key={toast.id} className="pxc-toast" role="status">{toast.msg}</div>}

          {/* 加载画面 */}
          {phase === 'loading' && (
            <div className="pxc-loading" role="status">
              <h2>像素都市</h2>
              <div className="sub">NOW LOADING · 离线预渲染管线</div>
              <div className="pxc-bar">
                <div style={{ width: `${Math.round(prog.frac * 100)}%` }} />
              </div>
              <div className="label">正在生成：{prog.label} … {Math.round(prog.frac * 100)}%</div>
              <div className="label" style={{ opacity: 0.55 }}>
                程序化建模 → 2:1 等距正交光栅化 → 有限色板 + 有序抖动
              </div>
            </div>
          )}
        </div>

        {/* 桌面右侧建造中心（整板可收缩） */}
        {!isMobile && (
          ui.panel ? (
            <aside className="pxc-panel" aria-label="建造面板">
              <div className="pxc-phead">
                <span>建 造 中 心</span>
                <button className="pxc-foldbtn" onClick={() => toggle('panel')}
                  title="收起面板" aria-label="收起面板">▶ 收起</button>
              </div>
              <div className="pxc-pbody">
                {buildGroup}
                {miniGroup}
                {cityOpsGroup}
                <div style={{ flex: 1 }} />
                {aboutGroup}
              </div>
            </aside>
          ) : (
            <button className="pxc-paneltab" onClick={() => toggle('panel')}
              title="展开建造中心" aria-label="展开建造中心">
              <span>建<br />造<br />中<br />心</span>◀
            </button>
          )
        )}
      </div>

      {/* 状态栏（桌面） */}
      {!isMobile && (
        <div className="pxc-status">
          <div title="光标格坐标">
            {hover ? `X:${hover.tx} Y:${hover.ty}` : 'X:— Y:—'}
          </div>
          <div className="pxc-hint">{hint}</div>
          <div><b>人口</b> {stats.pop}</div>
          <div><b>建筑</b> {stats.buildings}</div>
          <div><b>道路</b> {stats.roads}</div>
          <div><b>树木</b> {stats.trees}</div>
          <div><b>时间</b> {clock.text} {clock.ph}</div>
          {ui.crowds && <div><b>行人</b> {crowd.peds} · {crowd.pets} 宠 · {crowd.cars} 车</div>}
        </div>
      )}

      {/* 移动端底部：工具条 + 抽屉 */}
      {isMobile && (
        <>
          <div className="pxc-mtoolwrap">
            <div className="pxc-mtools" role="toolbar" aria-label="工具">
              {TOOLBAR.map(item => {
                let on = false;
                if (tool.t === item.tool.t) {
                  if (tool.t === 'build' && item.tool.t === 'build') {
                    on = defById(tool.id).cat === item.cat;
                  } else if (tool.t === 'terr' && item.tool.t === 'terr') {
                    on = tool.k === item.tool.k;
                  } else if (tool.t !== 'build' && tool.t !== 'terr') on = true;
                }
                return (
                  <button key={item.label} className={`pxc-mtool${on ? ' on' : ''}`}
                    aria-label={item.label}
                    onClick={() => {
                      if (item.tool.t === 'terr') setSubCat('terr');
                      pickTool(item.tool, item.cat ?? (item.tool.t === 'terr' ? 'terr' : undefined));
                    }}>
                    <img src={iu(item.icon)} alt="" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className={`pxc-drawer${ui.drawer ? ' open' : ''}`}>
            <button className="pxc-dhandle" onClick={() => toggle('drawer')}
              aria-expanded={ui.drawer} aria-label="建造中心抽屉">
              <i>{ui.drawer ? '▼' : '▲'}</i>
              <span className="t">建 造 中 心</span>
              <span className="s">
                人口 {stats.pop} · 建筑 {stats.buildings}
                {ui.crowds ? ` · 行人 ${crowd.peds}${crowd.pets ? `+${crowd.pets}宠` : ''}` : ''} · {clock.text}
              </span>
            </button>
            {ui.drawer && (
              <div className="pxc-dbody">
                {buildGroup}
                {cityOpsGroup}
                {miniGroup}
                {aboutGroup}
              </div>
            )}
          </div>
        </>
      )}

      {/* 存档模态 */}
      {modal === 'save' && (
        <div className="pxc-mask" onClick={e => { if (e.target === e.currentTarget) setModal('none'); }}>
          <div className="pxc-modal" role="dialog" aria-label="存档管理">
            <header>
              存 档 管 理
              <button className="pxc-x" onClick={() => setModal('none')} aria-label="关闭">×</button>
            </header>
            <div className="pxc-body">
              {[0, 1, 2].map(i => {
                const meta = slotMeta[i];
                return (
                  <div className="pxc-slot" key={i}>
                    <div className="pxc-slotmeta">
                      <div className="t1">存档位 {i + 1}</div>
                      <div className="t2">{meta ? `${meta.time} · 人口 ${meta.pop}` : '— 空 —'}</div>
                    </div>
                    <button className="pxc-btn primary" onClick={() => doSave(i)}>保存</button>
                    <button className="pxc-btn" disabled={!meta} onClick={() => doLoad(i)}>读取</button>
                    <button className="pxc-btn" disabled={!meta} onClick={() => doDelete(i)}>删除</button>
                  </div>
                );
              })}
              <div className="pxc-row" style={{ marginTop: 8 }}>
                <button className="pxc-btn" onClick={() => {
                  const eng = engineRef.current;
                  if (eng && eng.loadAuto()) { say('已恢复自动存档'); setModal('none'); }
                  else say('暂无自动存档');
                }}>恢复自动存档</button>
                <span style={{ fontSize: 11, color: '#555c66', alignSelf: 'center' }}>
                  每隔约 25 秒自动保存一次
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 帮助模态 */}
      {modal === 'help' && (
        <div className="pxc-mask" onClick={e => { if (e.target === e.currentTarget) setModal('none'); }}>
          <div className="pxc-modal" role="dialog" aria-label="操作说明">
            <header>
              操 作 说 明
              <button className="pxc-x" onClick={() => setModal('none')} aria-label="关闭">×</button>
            </header>
            <div className="pxc-body">
              {isMobile ? (
                <table className="pxc-help">
                  <tbody>
                    <tr><td>单指</td><td>使用当前工具（涂地形 / 画路 / 放建筑）</td></tr>
                    <tr><td>双指拖动</td><td>平移视野</td></tr>
                    <tr><td>双指捏合</td><td>缩放（×1 / ×2 / ×3），也可用顶栏 ±</td></tr>
                    <tr><td>底栏</td><td>工具横滑切换；▲ 展开建造中心抽屉</td></tr>
                    <tr><td>面板</td><td>所有面板都能点标题栏 ▾ / ▸ 收起展开</td></tr>
                    <tr><td>行人</td><td>建造中心 → 市政操作，可自动或手动 0-300 人；街头另有警察/邮递员/学生/主厨/慢跑者与猫狗宠物出没</td></tr>
                    <tr><td>昼夜</td><td>市政操作：自动循环（×1/×2/×4）或跳转 晨/午/暮/夜</td></tr>
                  </tbody>
                </table>
              ) : (
                <table className="pxc-help">
                  <tbody>
                    <tr><td>左键</td><td>使用当前工具（涂地形 / 画路 / 放建筑）</td></tr>
                    <tr><td>右键 / 中键拖动</td><td>平移视野（观察工具下左键也可）</td></tr>
                    <tr><td>滚轮</td><td>以光标为中心缩放（×1 / ×2 / ×3）</td></tr>
                    <tr><td>W A S D / 方向键</td><td>平移视野</td></tr>
                    <tr><td>空格</td><td>视野居中</td></tr>
                    <tr><td>1 – 9</td><td>观察 / 植树 / 道路 / 地形 / 住宅 / 商业 / 工业 / 公共 / 推土</td></tr>
                    <tr><td>G</td><td>一键生成整座城市（可反复按，每次全新）</td></tr>
                    <tr><td>Ctrl + Z / Ctrl + Shift + Z</td><td>撤销 / 重做</td></tr>
                    <tr><td>Esc</td><td>切回观察工具</td></tr>
                  </tbody>
                </table>
              )}
              <div style={{ marginTop: 10, fontSize: 12, lineHeight: 1.8 }}>
                小贴士：按 G 或点「一键城市」秒得一座分区完备的城市；市政操作里可调
                「密度」（疏朗/适中/繁华）与「行人」数量（自动或手动 0-300）；
                「昼夜」支持自动循环与场景跳转——深夜会点亮万家灯火、路灯与霓虹，
                行人也会随夜色回家；随机地图有 10 种地形；植树有 6 种树（含樱花）。
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
