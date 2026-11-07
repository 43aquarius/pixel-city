// v28_vlm.ts — 截图 VLM 复核（大事年表：纪元带/四色点阵/日轴刻度/密度条/卷表切换/移动端）
import ZAI, { VisionMessage } from 'z-ai-web-dev-sdk';
import * as fs from 'fs';

function b64(p: string): string {
  return 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');
}

async function ask(zai: Awaited<ReturnType<typeof ZAI.create>>, img: string, prompt: string): Promise<string> {
  const messages: VisionMessage[] = [
    {
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: img } },
      ],
    },
  ];
  const response = await zai.chat.completions.createVision({
    model: 'glm-4.6v',
    messages,
    thinking: { type: 'disabled' },
  });
  return response.choices?.[0]?.message?.content ?? '(空回复)';
}

async function main(): Promise<void> {
  const zai = await ZAI.create();
  const S = '/home/z/my-project/scripts';

  // 1. 桌面 · 大事年表整体：纪元带 + 横轴结构
  const r1 = await ask(zai, b64(`${S}/v28_tl_desktop.png`),
    '这是复古像素城市经营游戏「城史长卷」里的「大事年表」横轴总览页截图（米黄纸卷风格）。请检查：1) 横向时间轴背景是否分成若干段「纪元带」，能否看到「拓荒营地」「炊烟村庄」「市井小镇」「一方城市」「摩登都会」等纪元名（至少 3 个可辨）？2) 各带是否有交替底色或左侧虚线分界？3) 顶部是否有「分卷长卷 / 大事年表」两个切换标签、题签统计（笔数/天数）与检索框？请逐项回答是/否并简述。');
  console.log('=== [1] 桌面年表：纪元带 + 横轴结构 ===\n' + r1 + '\n');

  // 2. 桌面 · 点阵细节：四色点 + 日轴刻度 + 密度条
  const r2 = await ask(zai, b64(`${S}/v28_tl_desktop.png`),
    '这是同一「大事年表」页截图。请检查：1) 轴上是否散布着多枚彩色小点（菱形），至少能分辨出金色大点、绿色点、红色点、青灰点中的三种？是否还有圆环形的点（回望纪事）？2) 轴下方是否有「第N天」字样的日轴刻度（至少两三个可辨）？3) 页面底部是否有一排高低不一的密度柱状条？4) 有无点重叠成一团、文字截断或元素溢出纸面的情况？请简洁回答。');
  console.log('=== [2] 桌面年表：四色点阵 + 刻度 + 密度条 ===\n' + r2 + '\n');

  // 3. 移动端 · 大事年表窄屏适配
  const r3 = await ask(zai, b64(`${S}/v28_tl_mobile.png`),
    '这是同一「大事年表」页在移动端 390×844 的截图。请检查：1) 「分卷长卷 / 大事年表」切换标签是否仍完整可见可点？2) 时间轴上的彩色点是否比桌面端更大（便于手指点按）、纪元带与刻度在窄屏下仍可辨认？3) 页面有无横向溢出、布局破损或元素重叠？请简洁回答。');
  console.log('=== [3] 移动端年表适配 ===\n' + r3 + '\n');
}

main().catch(e => { console.error('VLM 复核失败:', e); process.exit(1); });
