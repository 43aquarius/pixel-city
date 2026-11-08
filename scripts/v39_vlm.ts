// v39_vlm.ts — 截图 VLM 复核（城市日报版面 / 报馆建筑 / 移动端适配）
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

  // 1. 城市日报版面（报头 / 头条 / 四栏目 / 广告栏 / 脚注）
  const r1 = await ask(zai, b64(`${S}/v39_news.png`),
    '这是复古像素城市经营游戏的一个弹窗面板截图，应为《城市日报》读报面板。请核对：a) 面板顶部是否有大字报头（「城市日报」或「号外」）与期号/日期行；b) 报头下是否有头版头条区（标题加一段正文）；c) 是否有四个带小标题的栏目（市况/气象/来信选登/连载·城南旧事）；d) 栏目下方是否有两条虚线框广告；e) 底部是否有发行数据脚注（发行份数/净收入/累计）；f) 中文文案是否清晰无乱码、报版纸面米黄底色、布局有无错位溢出。请逐项简洁回答。');
  console.log('=== [1] 城市日报版面 ===\n' + r1 + '\n');

  // 2. 报馆建筑（编辑楼 / 锯齿天窗排字房 / 卷筒纸卷 / 霓虹报字 / 门楣灯箱）
  const r2 = await ask(zai, b64(`${S}/v39_press_bld.png`),
    '这是同一游戏等距像素城市画面，画面中心应有一座 2×2 的「报馆」建筑。请核对：a) 是否有一栋米白或米色三层编辑楼（坡顶带窗）；b) 楼侧是否带一栋低矮的锯齿天窗排字房；c) 屋顶上是否有白色的圆柱形卷筒纸卷；d) 建筑墙面是否有红色或青色的霓虹招牌方块；e) 建筑是否坐落在城市街区内、与道路及周边建筑协调、无悬空或错位。请逐项简洁回答。');
  console.log('=== [2] 报馆建筑 ===\n' + r2 + '\n');

  // 3. 移动端适配
  const r3 = await ask(zai, b64(`${S}/v39_mobile.png`),
    '这是同一游戏在手机竖屏（约 390×844）下的《城市日报》面板截图。请核对：a) 报版是否占满屏宽且各栏目改为单列纵向堆叠；b) 报头大字与期号行是否清晰、无截断；c) 头条正文与栏目文字是否可读、有无横向溢出；d) 整体有无明显布局错乱或元素重叠。请简洁回答。');
  console.log('=== [3] 移动端适配 ===\n' + r3 + '\n');
}

void main();
