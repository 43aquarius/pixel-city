// v24_vlm.ts — 截图 VLM 复核（消防栓新建筑 + 烈火实景特效 + 盲区火苗警示 + 双端协调）
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

  // 1. 消防栓特写
  const r1 = await ask(zai, b64(`${S}/v24_hydrant_closeup.png`),
    '这是复古等距像素城市经营游戏特写。画面中应有一座「消防栓」小建筑：混凝土方台 + 台缘一圈亮黄警示条 + 红色圆柱栓身（下粗上细）+ 中部六角颈圈 + 侧向凸出的出水短管 + 顶部穹顶帽与黄色顶螺母。请回答：1) 上述部件哪些可辨认？2) 与周围建筑相比是否明显是小体量街边设施？3) 像素画风是否协调、有无渲染错乱（贴图撕裂/错位/黑块）？请简洁回答。');
  console.log('=== [1] 消防栓特写 ===\n' + r1 + '\n');

  // 2. 烈火实景特写（stage2 烈火 + 过火标签）
  const r2 = await ask(zai, b64(`${S}/v24_blaze_closeup.png`),
    '这是复古等距像素城市经营游戏的火灾事件特写。画面中应有一栋建筑正在猛烈燃烧：多簇橙红/黄色高焰 + 白热火心 + 迸溅火星 + 上升烟柱，建筑上方有深色标签框写着「烈火×2!」之类字样（表示已过火多栋）。请回答：1) 火焰簇是否明显可见且有多簇层次？2) 烟柱是否可见？3) 火灾标签是否可辨认？4) 有无渲染错乱？请简洁回答。');
  console.log('=== [2] 烈火实景 ===\n' + r2 + '\n');

  // 3. 盲区火苗警示（南郊商街 A 图）
  const r3 = await ask(zai, b64(`${S}/v24_blindzone_A.png`),
    '这是复古等距像素城市经营游戏截图，视角对准城市南郊商街。画面中部分建筑在消防覆盖之外（游戏设定：消防盲区建筑脚下有暖橙色焦枯阴影菱形，屋顶上方有橙色小火苗警示在闪烁）。请回答：1) 建筑脚下的暖橙色阴影是否可见？明显/隐约/不可见？2) 屋顶上方的橙色小火苗警示是否可见？3) 画面整体是否正常（无白屏/黑块/贴图错位）？请简洁回答。');
  console.log('=== [3] 盲区火苗警示 ===\n' + r3 + '\n');

  // 4. 全城协调（桌面端）
  const r4 = await ask(zai, b64(`${S}/v24_city.png`),
    '这是复古等距像素城市经营游戏的桌面端城市截图（南郊商街 + 消防局）。请回答：1) 整体画面是否正常（无白屏/黑块/贴图错位/UI 破损）？2) 建筑与道路、消防设施是否协调统一？3) 有无明显影响观感的异常元素？请简洁回答。');
  console.log('=== [4] 桌面端协调 ===\n' + r4 + '\n');

  // 5. 移动端协调
  const r5 = await ask(zai, b64(`${S}/v24_mobile.png`),
    '这是复古等距像素城市经营游戏的移动端截图。请回答：1) 整体画面是否正常（无白屏/黑块/贴图错位/UI 破损）？2) 建筑与道路、绿化是否协调统一？3) 有无明显影响观感的异常元素？请简洁回答。');
  console.log('=== [5] 移动端协调 ===\n' + r5 + '\n');
}

main().catch(e => { console.error('VLM 失败:', e?.message || e); process.exit(1); });
