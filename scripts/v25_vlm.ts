// v25_vlm.ts — 截图 VLM 复核（窃贼实景剪影 + 人物志 UI + 双端协调）
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

  // 1. 作案剪影特写
  const r1 = await ask(zai, b64(`${S}/v25_thief_act.png`),
    '这是复古等距像素城市经营游戏的治安事件特写。画面中心附近一栋商铺建筑处应有一个「蒙面窃贼」像素剪影：深色小人形半身探在建筑旁（蒙面+白色眼罩条），附近有红色惊叹号警示与深色事件标签框（写着「店铺失窃!」类字样）。请回答：1) 深色小人剪影是否可见（在建筑旁/窗边位置）？2) 红色惊叹号是否可见？3) 事件标签是否可辨认？4) 有无渲染错乱（白屏/黑块/贴图错位）？请简洁回答。');
  console.log('=== [1] 作案剪影 ===\n' + r1 + '\n');

  // 2. 人物志 UI（市民列传详情页）
  const r2 = await ask(zai, b64(`${S}/v25_story_ui.png`),
    '这是复古等距像素城市经营游戏的「市民列传」详情面板截图。面板中除头像/性格/大事记等区块外，应有一个「人物志 · 根与迹」段落：浅米色底、虚线边框，内容是一段连贯的中文小传（含「出身」「生平记事」等字样，讲述该市民的根/家/迹）。请回答：1) 「人物志」段落是否存在且完整可读？2) 文字内容是否是连贯成文的段落（而非零散字段）？3) 面板整体有无布局破损/文字溢出？请简洁回答。');
  console.log('=== [2] 人物志 UI ===\n' + r2 + '\n');

  // 3. 桌面端全城协调
  const r3 = await ask(zai, b64(`${S}/v25_city.png`),
    '这是复古等距像素城市经营游戏的桌面端城市截图（南郊商街布局：商铺/交番/道路网）。请回答：1) 整体画面是否正常（无白屏/黑块/贴图错位/UI 破损）？2) 建筑与道路是否协调统一？3) 有无明显影响观感的异常元素？请简洁回答。');
  console.log('=== [3] 桌面端协调 ===\n' + r3 + '\n');

  // 4. 移动端
  const r4 = await ask(zai, b64(`${S}/v25_mobile.png`),
    '这是同一游戏在移动端 390×844 的截图。请回答：1) 布局是否在窄屏下正常（HUD/面板不重叠、无横向溢出白边）？2) 画面是否完整（无白屏/黑块）？3) 触控目标是否清晰？请简洁回答。');
  console.log('=== [4] 移动端 ===\n' + r4 + '\n');

  // 5. 被擒剪影特写（人赃并获）
  const r5 = await ask(zai, b64(`${S}/v25_thief_caught.png`),
    '这是治安事件「人赃并获」阶段的特写。理论上事件现场附近应有被制服的窃贼剪影（抱头蹲地姿态、黯淡藏青色）与金色标签（「人赃并获!」）。注意：游戏内时间流速较快，截图可能捕捉到事件的不同阶段（作案中/已收场）。请如实回答：1) 画面中是否能看到任何深色小人剪影或事件标签？2) 画面整体是否正常（无渲染错乱）？3) 若未见剪影/标签，说明是事件时序问题还是渲染缺陷（画面其余部分是否健康）？请简洁回答。');
  console.log('=== [5] 被擒剪影（时序敏感） ===\n' + r5 + '\n');
}

main().catch(e => { console.error('VLM 复核失败:', e); process.exit(1); });
