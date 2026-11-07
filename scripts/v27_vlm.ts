// v27_vlm.ts — 截图 VLM 复核（城史长卷：纸卷美学/卷目导航/分卷卷首/检索框/移动端折叠）
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

  // 1. 桌面 · 卷首：纸卷美学 + 卷目导航
  const r1 = await ask(zai, b64(`${S}/v27_scroll_top.png`),
    '这是复古像素城市经营游戏的「城史长卷」全屏编年史阅读页截图（模拟纸卷装帧）。请检查：1) 左侧是否有一列卷目导航，含「第一卷 拓荒营地」至「第五卷 摩登都会」五项，且当前卷有高亮区分？2) 主阅读区是否呈米黄纸面质感、卷首有双线界栏与卷首语（如「荒原之上，市政厅的旗杆第一个立起来…」）？3) 纸面上是否有一枚红色「城史」印章（竖排、微旋转）？4) 顶部是否有题签（含纪元/天数/累计落笔统计）与关键字检索框？请逐项回答是/否并简述。');
  console.log('=== [1] 桌面卷首：纸卷美学 + 卷目导航 ===\n' + r1 + '\n');

  // 2. 桌面 · 卷首：纪事条目四色与可读性
  const r2 = await ask(zai, b64(`${S}/v27_scroll_top.png`),
    '这是同一「城史长卷」阅读页截图。请检查阅读区中的纪事条目：1) 条目是否带彩色左边条且至少能分辨出两三种不同颜色（如喜事的暖色、灾祸的红色、大事的金色、政务杂闻的青灰）？2) 条目文字是否清晰可读（标题加粗 + 正文 + 天数）？3) 有无文字重叠、截断或溢出纸面的情况？请简洁回答。');
  console.log('=== [2] 桌面卷首：四色纪事条目 ===\n' + r2 + '\n');

  // 3. 桌面 · 跳转末卷：滚动定位 + 未完待续
  const r3 = await ask(zai, b64(`${S}/v27_scroll_jump.png`),
    '这是同一阅读页点击左侧卷目导航最后一卷（第五卷·摩登都会）后的截图。请检查：1) 阅读区是否已滚动到后面的卷（卷首标注「第五卷 摩登都会」类字样，并有「未完待续」收尾标注）？2) 左侧导航最后一项是否呈高亮/选中态？3) 整页有无布局破损、错位或空白异常？请简洁回答。');
  console.log('=== [3] 桌面跳转末卷 ===\n' + r3 + '\n');

  // 4. 移动端：卷目折叠横条
  const r4 = await ask(zai, b64(`${S}/v27_scroll_mobile.png`),
    '这是同一「城史长卷」阅读页在移动端 390×844 的截图。请检查：1) 卷目导航是否折叠为顶部的横向窄条（五卷横排或可横滑）？2) 纸卷阅读区在窄屏下是否正常（无横向溢出、文字不截断）？3) 题签与检索框是否仍可用、不与导航重叠？请简洁回答。');
  console.log('=== [4] 移动端折叠横条 ===\n' + r4 + '\n');
}

main().catch(e => { console.error('VLM 复核失败:', e); process.exit(1); });
