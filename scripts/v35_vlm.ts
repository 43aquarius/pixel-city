// v35_vlm.ts — 截图 VLM 复核（兽芯片/物种图鉴九宫格/动物园建筑街景/移动端适配）
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

  // 1. 物种图鉴九宫格
  const r1 = await ask(zai, b64(`${S}/v35_zoo_modal.png`),
    '这是复古等距像素城市经营游戏的「物种图鉴」模态截图。应包含：1) 顶部进度行「图鉴 9/9 种 · 吸引力 +23 · 游客 ×1.08 · 下次巡查倒计时」；2) 九宫格动物卡片（垂耳兔/小山羊/梅花鹿/蓝孔雀/火烈鸟/小熊猫/王企鹅/锦鲤/大熊猫），每卡有像素动物头像 + 名称 + 一句话介绍 + 加成文字，大熊猫卡应有金色「镇园」徽章。请回答：a) 九张卡片是否齐全且头像可辨（尤其熊猫黑白配色、孔雀蓝绿、火烈鸟粉色）？b) 有无布局破损/文字溢出？请简洁回答。');
  console.log('=== [1] 物种图鉴九宫格 ===\n' + r1 + '\n');

  // 2. 城市全景（含动物园建筑）
  const r2 = await ask(zai, b64(`${S}/v35_zoo.png`),
    '这是同一游戏的城市全景截图，城内应有一座 3×3 的「动物园」建筑：木围栏围出的园区、红顶（或青顶）兽舍小屋、蓝色小水池、入口砖柱与招牌、几棵树。请回答：1) 能否找到这座动物园建筑并辨认出围栏/兽舍/水池等部件？2) 它与周边建筑画风是否协调（无渲染错乱/悬空/贴图异常）？3) 顶栏 HUD 是否有一个带爪印图标的「兽」芯片（显示 9/9）？请简洁回答。');
  console.log('=== [2] 动物园建筑街景 ===\n' + r2 + '\n');

  // 3. 移动端
  const r3 = await ask(zai, b64(`${S}/v35_mobile.png`),
    '这是同一游戏在移动端 390×844 的「物种图鉴」模态截图（九宫格在窄屏下应为两列排布）。请回答：1) 模态是否完整显示、无横向溢出/白边？2) 动物卡片文字在窄屏下是否可读？3) 有无元素重叠或破版？请简洁回答。');
  console.log('=== [3] 移动端 ===\n' + r3 + '\n');
}

main().catch(e => { console.error('VLM 复核失败:', e); process.exit(1); });
