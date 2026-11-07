// v34_vlm.ts — 截图 VLM 复核（球芯片/球场风云模态/赢球彩带/移动端适配）
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

  // 1. 桌面端球场风云模态
  const r1 = await ask(zai, b64(`${S}/v34_lg_modal.png`),
    '这是复古等距像素城市经营游戏的「球场风云」模态面板截图（体育联赛玩法）。请检查四点：1) 面板内应有一张赛程卡（含「比赛日」或「第 N 赛季」徽章、主队「市民联」与客队名、档次标签）；2) 战绩表应有「全期战绩 / 本季积分 / 连胜纪录 / 上一场」四行；3) 应有「最近五场」一排彩色小方块（绿=胜/黄=平/红=负）；4) 底部荣誉墙应有「冠军旗帜 ×N」「亚军奖盘 ×N」「季军奖牌 ×N」徽章。请回答：a) 四个区块是否齐全且文字可辨？b) 有无布局破损/文字溢出/元素重叠？请简洁回答。');
  console.log('=== [1] 球场风云模态 ===\n' + r1 + '\n');

  // 2. 赢球彩带全城特效
  const r2 = await ask(zai, b64(`${S}/v34_cheer.png`),
    '这是同一游戏赢下足球比赛瞬间的全城截图。画面上层应飘落着五彩纸屑/彩带（红/黄/青/绿/蓝/粉/白等多色小纸片，散布在画面各处）。请回答：1) 彩带粒子是否清晰可见（至少能数出十处以上彩色小纸片）？2) 彩带是否遮挡了关键 UI（顶栏 HUD 文字是否仍可读）？3) 城市画面本身有无异常（白屏/黑块/贴图错乱）？请简洁回答。');
  console.log('=== [2] 赢球彩带 ===\n' + r2 + '\n');

  // 3. 移动端球场风云
  const r3 = await ask(zai, b64(`${S}/v34_mobile.png`),
    '这是同一游戏在移动端 390×844 的「球场风云」模态截图。请回答：1) 模态是否完整显示且宽度不超出屏幕（无横向溢出/白边）？2) 赛程卡/战绩表/荣誉墙文字在窄屏下是否仍可读？3) 有无元素重叠或布局破损？请简洁回答。');
  console.log('=== [3] 移动端 ===\n' + r3 + '\n');
}

main().catch(e => { console.error('VLM 复核失败:', e); process.exit(1); });
