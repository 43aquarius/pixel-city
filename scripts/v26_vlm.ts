// v26_vlm.ts — 截图 VLM 复核（生命周期/评段/故人卡/城市志生民行/双端协调）
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

  // 1. 详情页：人物志评段 + 故人卡
  const r1 = await ask(zai, b64(`${S}/v26_story_ui.png`),
    '这是复古等距像素城市经营游戏的「市民列传」详情面板截图。请检查两点：1) 「人物志 · 根与迹」段落末尾应有一句「街坊口碑：……」收束语（如「日子过得平顺…」或「老福星」类口碑）；2) 「一家人」区块中应有一张灰化的「故人」卡（虚线边框、斜体，标注「已故 · 相守到老」类文案），与普通家人卡区分。请回答：a) 街坊口碑句是否存在且完整可读？b) 故人卡是否可见且样式与普通卡有区分？c) 面板有无布局破损/文字溢出？请简洁回答。');
  console.log('=== [1] 评段 + 故人卡 ===\n' + r1 + '\n');

  // 2. 城市志：生民列传行
  const r2 = await ask(zai, b64(`${S}/v26_data_row.png`),
    '这是同一游戏的「城市志」数据面板截图。在「人口结构」表格中（总人口/劳动人口/学龄人口/银发人口之后）应有一行「生民列传」：形如「在册 N · 长者 X · 本城出生 Y · 长大成人 Z · 含笑而归 W」。请回答：1) 该行是否存在且数字可辨？2) 行样式是否与表格其余行协调？3) 面板整体有无布局破损？请简洁回答。');
  console.log('=== [2] 城市志生民行 ===\n' + r2 + '\n');

  // 3. 桌面端全城协调
  const r3 = await ask(zai, b64(`${S}/v26_city.png`),
    '这是复古等距像素城市经营游戏的桌面端城市截图（南郊商街布局：商铺/道路网/行人）。请回答：1) 整体画面是否正常（无白屏/黑块/贴图错位/UI 破损）？2) 建筑与道路是否协调统一？3) 有无明显影响观感的异常元素？请简洁回答。');
  console.log('=== [3] 桌面端协调 ===\n' + r3 + '\n');

  // 4. 移动端
  const r4 = await ask(zai, b64(`${S}/v26_mobile.png`),
    '这是同一游戏在移动端 390×844 的截图。请回答：1) 布局是否在窄屏下正常（HUD/面板不重叠、无横向溢出白边）？2) 画面是否完整（无白屏/黑块）？3) 触控目标是否清晰？请简洁回答。');
  console.log('=== [4] 移动端 ===\n' + r4 + '\n');
}

main().catch(e => { console.error('VLM 复核失败:', e); process.exit(1); });
