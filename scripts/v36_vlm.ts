// v36_vlm.ts — 截图 VLM 复核（医疗盲区层/疫病现场特效/诊所防疫站精灵/移动端适配）
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

  // 1. 医疗盲区层（青灰病气阴影 + 屋顶绿十字缓闪）
  const r1 = await ask(zai, b64(`${S}/v36_blindzone.png`),
    '这是复古等距像素城市经营游戏的街景截图。画面里的住宅区应呈现「医疗盲区」状态：1) 部分建筑脚下铺有青灰绿色的半透明菱形阴影（病气意象）；2) 部分住宅屋顶上方应有绿色小十字在缓闪（表示这里缺诊所）。另有一个疫点建筑上可能有绿色病雾与「疫情」标签框。请回答：a) 能否看到青灰菱形阴影与屋顶绿色十字？b) 阴影色调与治安冷蓝/消防暖橙是否明显不同（偏青绿）？c) 画面有无渲染错乱？请简洁回答。');
  console.log('=== [1] 医疗盲区层 ===\n' + r1 + '\n');

  // 2. 疫病现场特效（病人剪影 + 病雾 + 标签）
  const r2 = await ask(zai, b64(`${S}/v36_plague_live.png`),
    '这是同一游戏疫病事件现场的截图。疫点住宅上应有：1) 深色小人剪影倚在建筑窗边（弓背咳嗽姿态，手持白帕）；2) 绿色病雾从建筑处缓缓升起；3) 建筑上方有深色标签框写着「疫病流行!」。请回答：a) 病人剪影、病雾、标签三要素是否可辨？b) 标签文字是否清晰完整？c) 特效与画面其他元素有无重叠错乱？请简洁回答。');
  console.log('=== [2] 疫病现场特效 ===\n' + r2 + '\n');

  // 3. 诊所 + 防疫站建筑街景
  const r3 = await ask(zai, b64(`${S}/v36_clinic_closeup.png`),
    '这是同一游戏两座新医疗建筑的街景截图：1) 「社区诊所」：白色（或青白）小楼 + 青绿色缓坡屋顶 + 门脸上方绿十字招牌 + 门前雨棚与候诊长椅；2) 「防疫站」：方正青灰哨所小楼 + 黄黑警示基线 + 平顶警报灯 + 白十字旗杆 + 门前一排青色药剂罐。请回答：a) 能否辨认出这两座建筑及其部件（十字招牌/旗杆/药剂罐/长椅）？b) 它们与周边建筑画风是否协调（无渲染错乱/悬空/比例失当）？请简洁回答。');
  console.log('=== [3] 诊所防疫站街景 ===\n' + r3 + '\n');

  // 4. 城市志医疗行（桌面）
  const r4 = await ask(zai, b64(`${S}/v36_fiscal_med.png`),
    '这是同一游戏桌面端「财政报告/城市志」数据面板截图。指数区块中应有一行「悬壶济世」：显示医疗覆盖率与诊所/防疫站计数、疫病零蔓延化解次数；紧邻的「健康指数」行应显示「医院 N · 诊所 N · 防疫站 N」。请回答：a) 「悬壶济世」行是否存在且文字完整（无截断/溢出）？b) 整个面板在桌面端有无布局破损？请简洁回答。');
  console.log('=== [4] 城市志医疗行 ===\n' + r4 + '\n');

  // 5. 移动端
  const r5 = await ask(zai, b64(`${S}/v36_mobile.png`),
    '这是同一游戏在移动端 390×844 的数据面板截图（应包含「悬壶济世」医疗行与「健康指数」行）。请回答：1) 表格在窄屏下是否完整显示、无横向溢出/白边？2) 行文字是否可读、有无元素重叠或破版？请简洁回答。');
  console.log('=== [5] 移动端适配 ===\n' + r5 + '\n');
}

main().catch(e => { console.error('VLM 复核失败:', e); process.exit(1); });
