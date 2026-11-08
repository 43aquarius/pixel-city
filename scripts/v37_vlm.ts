// v37_vlm.ts — 截图 VLM 复核（姊妹城市面板 / 求援急件横幅 / 移动端适配）
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

  // 1. 姊妹城市面板（标题 / 三城卡 / 对照条 / 互市按钮）
  const r1 = await ask(zai, b64(`${S}/v37_sis_modal.png`),
    '这是复古像素城市经营游戏的一个弹窗面板截图，应为「姊妹城市」面板。请核对：a) 面板标题是否为「姊 妹 城 市」且有关闭按钮；b) 是否有三张邻城卡片，每张含城市名、市长名、城市风貌描述、人口/评级/好感三条进度条；c) 每卡底部是否有「发商队」或「未通商」按钮；d) 面板底部是否有统计底注；e) 中文文案是否清晰无乱码、布局有无错位溢出。请逐项简洁回答。');
  console.log('=== [1] 姊妹城市面板 ===\n' + r1 + '\n');

  // 2. 求援急件横幅（红边公文卡 / 准驳印章 / 时限提示）
  const r2 = await ask(zai, b64(`${S}/v37_sis_req.png`),
    '这是同一游戏姊妹城市面板出现「邻城急件」时的截图。面板顶部应有一条红色左边框的求援横幅：1) 左上角有红底白字「邻城急件」小标签；2) 横幅正文写明某邻城遭灾求援的缘由与市长名；3) 有「使者再候 N 游戏时」的时限提示；4) 横幅下方并排两枚按钮，各带一个倾斜的方形印章字「准」与「驳」。请回答：a) 急件横幅四要素是否齐全可辨？b) 两枚按钮与印章字是否清晰？c) 有无文字截断或元素重叠？请简洁回答。');
  console.log('=== [2] 求援急件横幅 ===\n' + r2 + '\n');

  // 3. 移动端适配
  const r3 = await ask(zai, b64(`${S}/v37_mobile.png`),
    '这是同一游戏在手机竖屏（约 390×844）下的姊妹城市面板截图。请核对：a) 面板是否占满屏宽且三张邻城卡片竖向堆叠；b) 文案是否清晰可读、有无横向溢出或截断；c) 求援横幅两枚按钮是否改为纵向排列（若画面中有急件）；d) 整体有无明显布局错乱。请简洁回答。');
  console.log('=== [3] 移动端适配 ===\n' + r3 + '\n');
}

void main();
