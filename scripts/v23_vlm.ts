// v23_vlm.ts — 截图 VLM 复核（警察局新建筑 + 治安盲区冷影 + 全城协调）
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

  // 1. 警察局特写
  const r1 = await ask(zai, b64(`${S}/v23_hq_closeup.png`),
    '这是复古等距像素城市经营游戏特写。画面中应有一座 2×2 的「警察局」：米白两层主楼 + 藏青（蓝灰）双坡屋顶 + 门楣蓝白灯箱 + 双开藏青卷闸门车库 + 侧墙红底白点警徽 + 沥青停车坪 + 旗杆 + 屋顶警灯。请回答：1) 上述部件哪些可辨认？2) 与旁边小型建筑相比体量是否更大？3) 像素画风是否协调、有无渲染错乱（贴图撕裂/错位/黑块）？请简洁回答。');
  console.log('=== [1] 警察局特写 ===\n' + r1 + '\n');

  // 2. 治安盲区全景（南郊商街）
  const r2 = await ask(zai, b64(`${S}/v23_city.png`),
    '这是复古等距像素城市经营游戏截图，视角对准城市南郊商街。画面下部应有一排 4 家商铺开在巡防覆盖之外（游戏设定：治安盲区商铺脚下有冷蓝色阴影菱形，楼顶上方有缓慢明灭的红色小警示点）。请回答：1) 商铺脚下的冷蓝色阴影是否可见？明显/隐约/不可见？2) 商铺上方的红色警示点是否可见？3) 画面整体是否正常（无白屏/黑块/贴图错位）？画风是否协调？请简洁回答。');
  console.log('=== [2] 治安盲区 ===\n' + r2 + '\n');

  // 3. 全城协调
  const r3 = await ask(zai, b64(`${S}/v23_mobile.png`),
    '这是复古等距像素城市经营游戏的移动端截图。请回答：1) 整体画面是否正常（无白屏/黑块/贴图错位/UI 破损）？2) 建筑与道路、绿化是否协调统一？3) 有无明显影响观感的异常元素？请简洁回答。');
  console.log('=== [3] 移动端协调 ===\n' + r3 + '\n');
}

main().catch(e => { console.error('VLM 失败:', e?.message || e); process.exit(1); });
