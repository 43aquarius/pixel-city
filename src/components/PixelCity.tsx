'use client';

// ============================================================
// PixelCity.tsx — 像素都市 · 界面壳与交互面板
// ============================================================

import {
  useEffect, useRef, useState, useCallback,
} from 'react';
import '@/lib/pixelcity/pixelcity.css';
import { Engine, type Tool } from '@/lib/pixelcity/engine';
import { Beeper } from '@/lib/pixelcity/audio';
import { CATALOG, defById, type Cat } from '@/lib/pixelcity/catalog';
import { iconURI } from '@/lib/pixelcity/icons';

const ICON_NAMES = [
  'undo', 'redo', 'zoomin', 'zoomout', 'sound', 'soundoff',
  'view', 'grass', 'water', 'sand', 'farm', 'rock', 'tree', 'road',
  'house', 'shop', 'factory', 'park', 'doze', 'city',
  'save', 'random', 'exportp', 'atlas',
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
];

const TOOLBAR: Array<{ icon: string; label: string; tool: Tool; cat?: Cat; hot: string }> = [
  { icon: 'view', label: '观察', tool: { t: 'view' }, hot: '1' },
  { icon: 'tree', label: '植树', tool: { t: 'tree' }, hot: '2' },
  { icon: 'road', label: '道路', tool: { t: 'road' }, hot: '3' },
  { icon: 'house', label: '住宅', tool: { t: 'build', id: 'house', variant: 0 }, cat: 'res', hot: '4' },
  { icon: 'shop', label: '商业', tool: { t: 'build', id: 'shop', variant: 0 }, cat: 'com', hot: '5' },
  { icon: 'factory', label: '工业', tool: { t: 'build', id: 'factory', variant: 0 }, cat: 'ind', hot: '6' },
  { icon: 'park', label: '公共', tool: { t: 'build', id: 'park', variant: 0 }, cat: 'civ', hot: '7' },
  { icon: 'doze', label: '推土', tool: { t: 'doze' }, hot: '8' },
];

function toolHint(t: Tool): string {
  switch (t.t) {
    case 'view': return '左键拖动平移 · 滚轮缩放 · 空格居中';
    case 'terr': return `按住左键涂画「${TERR_OPTS[t.k]?.label ?? '地形'}」（水域会淹没地上物）`;
    case 'tree': return '点击或拖动，种下随机小树';
    case 'road': return '按住左键拖出路网，转角自动拼接';
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
  const [hover, setHover] = useState<{ tx: number; ty: number } | null>(null);
  const [fps, setFps] = useState(0);
  const [zoom, setZoom] = useState(2);
  const [modal, setModal] = useState<'none' | 'save' | 'help'>('none');
  const [toast, setToast] = useState<{ id: number; msg: string } | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [slotMeta, setSlotMeta] = useState<Array<{ time: string; pop: number } | null>>([null, null, null]);
  const [cellsByCat, setCellsByCat] = useState<Record<string, CellItem[]>>({});
  const [iconSrc, setIconSrc] = useState<Record<string, string>>({});

  const engineRef = useRef<Engine | null>(null);
  const beeperRef = useRef<Beeper | null>(null);
  const viewRef = useRef<HTMLCanvasElement | null>(null);
  const miniRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const toastTimer = useRef<number>(0);

  const say = useCallback((msg: string) => {
    setToast({ id: Date.now(), msg });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2400);
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
      if (disposed || !viewRef.current || !miniRef.current) return;
      eng.attach(viewRef.current, miniRef.current);
      setStats(eng.map.stats());
      // 目录缩略图（异步回调中生成，避免 effect 内同步 setState）
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
      // 预生成全部像素图标（避免 SSR 期访问 document）
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
        Digit4: { t: 'build', id: 'house', variant: 0 },
        Digit5: { t: 'build', id: 'shop', variant: 0 },
        Digit6: { t: 'build', id: 'factory', variant: 0 },
        Digit7: { t: 'build', id: 'park', variant: 0 },
        Digit8: { t: 'doze' },
      };
      const t = map[e.code];
      if (t) {
        e.preventDefault();
        if (t.t === 'build') {
          const cat = defById(t.id).cat;
          setSubCat(cat);
        }
        eng2.setTool(t);
      }
    };
    window.addEventListener('keydown', onKey);

    return () => {
      disposed = true;
      ro.disconnect();
      window.removeEventListener('keydown', onKey);
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

  // ---------------- 渲染 ----------------
  return (
    <div className="pxc">
      {/* 标题栏 */}
      <div className="pxc-titlebar">
        <div className="pxc-logo" aria-hidden />
        <h1>像素都市 PIXEL CITY · 等距建造沙盒</h1>
        <div className="pxc-tb-actions">
          <button className="pxc-winbtn" title="撤销 (Ctrl+Z)" aria-label="撤销"
            onClick={() => engineRef.current?.undo()}>
            <img src={iu('undo')} alt="" width={12} height={12} />
          </button>
          <button className="pxc-winbtn" title="重做 (Ctrl+Shift+Z)" aria-label="重做"
            onClick={() => engineRef.current?.redo()}>
            <img src={iu('redo')} alt="" width={12} height={12} />
          </button>
          <button className="pxc-winbtn" title="缩小 (−)" aria-label="缩小"
            onClick={() => engineRef.current?.cycleZoom(-1)}>
            <img src={iu('zoomout')} alt="" width={12} height={12} />
          </button>
          <button className="pxc-winbtn" title="放大 (+)" aria-label="放大"
            onClick={() => engineRef.current?.cycleZoom(1)}>
            <img src={iu('zoomin')} alt="" width={12} height={12} />
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
          <button className="pxc-winbtn" title="最小化" aria-label="最小化"
            onClick={() => say('市政厅已驻留在你的屏幕上')}>─</button>
          <button className="pxc-winbtn" title="关闭" aria-label="关闭"
            onClick={() => say('这座城市永远为你敞开大门')}>×</button>
        </div>
      </div>

      {/* 主体 */}
      <div className="pxc-main">
        <div className="pxc-screen" ref={wrapRef}>
          <canvas ref={viewRef} className="pxc-view" role="img"
            aria-label="等距城市画布：左键使用工具，右键拖动平移，滚轮缩放" />
          <div className="pxc-crt" aria-hidden />

          {/* 工具条 */}
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
                  onClick={() => pickTool(item.tool, item.cat)}>
                  <img src={iu(item.icon)} alt="" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className="pxc-badge">ZOOM ×{zoom} · {fps} FPS</div>

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

        {/* 右侧面板 */}
        <aside className="pxc-panel" aria-label="建造面板">
          <div className="pxc-group">
            <div className="pxc-gtitle">建 造 面 板</div>
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
                  return (
                    <button key={`${c.id}#${c.v}`} className={`pxc-cell${on ? ' on' : ''}`}
                      title={`${c.name} · 变体 ${c.v + 1}`}
                      aria-label={`${c.name}变体${c.v + 1}`}
                      onClick={() => pickCell(c.id, c.v)}>
                      <img src={c.uri} alt={c.name} />
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

          <div className="pxc-group">
            <div className="pxc-gtitle">小 地 图</div>
            <canvas ref={miniRef} className="pxc-mini" aria-label="小地图" />
          </div>

          <div className="pxc-group">
            <div className="pxc-gtitle">市 政 操 作</div>
            <div className="pxc-row">
              <button className="pxc-btn primary" title="一键生成整座城市 (G)" onClick={() => {
                const eng = engineRef.current;
                if (!eng) return;
                const rep = eng.generateCity();
                if (rep) say(`一键城市：${rep.buildings} 栋建筑 · 人口 ${rep.pop} · 道路 ${rep.roads} 格`);
                else say('可用平地不足，先换个地形试试');
              }}>
                <img src={iu('city')} alt="" />一键城市
              </button>
              <button className="pxc-btn" onClick={() => { engineRef.current?.randomMap(); }}>
                <img src={iu('random')} alt="" />随机地图
              </button>
              <button className="pxc-btn" onClick={() => { engineRef.current?.clearMap(); }}>
                <img src={iu('doze')} alt="" />清空
              </button>
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

          <div style={{ flex: 1 }} />
          <div className="pxc-group" style={{ marginBottom: 8 }}>
            <div className="pxc-gtitle">关 于</div>
            <div style={{ fontSize: 11, lineHeight: 1.7, color: '#3d434e' }}>
              一切画面均由代码程序化生成：{CATALOG.length} 类建筑参数化建模，
              128×128 大地图 · 一键城市生成器，
              经固定 2:1 等距正交投影离线光栅化为透明精灵，
              叠加 66 色有限色板、Bayer 有序抖动、
              扫描线与 CRT 暗角 —— 向 DOS/PC98 与 SimCity 致敬。
            </div>
          </div>
        </aside>
      </div>

      {/* 状态栏 */}
      <div className="pxc-status">
        <div title="光标格坐标">
          {hover ? `X:${hover.tx} Y:${hover.ty}` : 'X:— Y:—'}
        </div>
        <div className="pxc-hint">{hint}</div>
        <div><b>人口</b> {stats.pop}</div>
        <div><b>建筑</b> {stats.buildings}</div>
        <div><b>道路</b> {stats.roads}</div>
        <div><b>树木</b> {stats.trees}</div>
      </div>

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
              <table className="pxc-help">
                <tbody>
                  <tr><td>左键</td><td>使用当前工具（涂地形 / 画路 / 放建筑）</td></tr>
                  <tr><td>右键 / 中键拖动</td><td>平移视野（观察工具下左键也可）</td></tr>
                  <tr><td>滚轮</td><td>以光标为中心缩放（×1 / ×2 / ×3）</td></tr>
                  <tr><td>W A S D / 方向键</td><td>平移视野</td></tr>
                  <tr><td>空格</td><td>视野居中</td></tr>
                  <tr><td>1 – 8</td><td>快捷切换：观察 / 植树 / 道路 / 住宅 / 商业 / 工业 / 公共 / 推土</td></tr>
                  <tr><td>G</td><td>一键生成整座城市（可反复按，每次全新）</td></tr>
                  <tr><td>Ctrl + Z / Ctrl + Shift + Z</td><td>撤销 / 重做</td></tr>
                  <tr><td>Esc</td><td>切回观察工具</td></tr>
                </tbody>
              </table>
              <div style={{ marginTop: 10, fontSize: 12, lineHeight: 1.8 }}>
                小贴士：按 G 或点「一键城市」秒得一座分区完备的城市（核心商务、扇区工业、
                外环耕地，还有城堡/灯塔/体育场等地标）；地形画板新增耕地与岩石；
                灯塔要放在临水沙地上；旧版本 64×64 存档会自动居中迁移到 128 大地图。
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
