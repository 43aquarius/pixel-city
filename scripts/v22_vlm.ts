// v22_vlm.ts — 截图 VLM 复核（大学城/小学新建筑 + 学区金光罩 + 全城协调）
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

  // 1. 大学城特写
  const r1 = await ask(zai, b64(`${S}/v22_univ_closeup.png`),
    '这是一款复古等距像素城市经营游戏的特写截图，画面中心应有一座 3×3 占地的「大学城」建筑：中央主楼 + 高耸钟塔（白色钟面+石板尖顶）+ 西侧青绿色圆穹顶图书馆 + 东侧红砖讲堂 + 拱形大门 + 中央绿茵庭院与旗杆。请回答：1) 大学城各部分（主楼/钟塔/穹顶/庭院）是否可辨认？2) 与周边小型住宅相比尺度感是否正确（应明显更大）？3) 像素画风是否协调、有无渲染错乱（贴图撕裂/错位/黑块）？4) 周边住宅脚下是否可见淡金色菱形光晕（学区光罩特效）？请简洁回答。');
  console.log('=== [1] 大学城特写 ===\n' + r1 + '\n');

  // 2. 小学特写
  const r2 = await ask(zai, b64(`${S}/v22_primary_closeup.png`),
    '这是复古等距像素城市经营游戏的特写截图，画面中应有一座 1×1 的「小学」建筑：红砖两层小楼 + 双坡瓦顶 + 白色小圆钟 + 旗杆 + 青色滑梯 + 沥青小操场。请回答：1) 小学是否可辨认（哪亄件可见）？2) 与周边住宅/建筑相比画风是否协调？3) 有无渲染错乱？请简洁回答。');
  console.log('=== [2] 小学特写 ===\n' + r2 + '\n');

  // 3. 全城协调
  const r3 = await ask(zai, b64(`${S}/v22_city.png`),
    '这是复古等距像素城市经营游戏的全城截图（视角对准大学城区）。请回答：1) 整体画面是否正常（无白屏/黑块/贴图错位/UI 破损）？2) 大型大学城建筑与道路、住宅、绿化的比例是否协调统一？3) 画面中住宅区是否泛着轻微的金色光晕（学区特效），是否自然不突兀？请简洁回答。');
  console.log('=== [3] 全城协调 ===\n' + r3 + '\n');
}

main().catch(e => { console.error('VLM 失败:', e?.message || e); process.exit(1); });
