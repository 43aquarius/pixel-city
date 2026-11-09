// v43_vlm.ts — 截图 VLM 复核（渔港建筑 / 渔汛与渔获图鉴模态 / 移动端适配 / 渔船出海）
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

  // 1. 渔港码头建筑特写（栈桥 / 停泊渔船 / 晒网架 / 渔获筐 / 鱼具房）
  const r1 = await ask(zai, b64(`${S}/v43_fishport_closeup.png`),
    '这是复古等距像素城市经营游戏的画面截图，画面中心应有一座 2×2 的「渔港码头」建筑。请核对：a) 是否有一座伸向水面的木质栈桥（直桥与桩柱）；b) 栈桥旁是否停泊着红棕色调的小渔船（白色驾驶舱与桅杆小旗）；c) 岸侧是否有晒网架（立杆横梁与格网）与堆放的黄色渔获筐；d) 是否有一栋灰顶小屋（鱼具房）；e) 建筑是否临水、与周边地形协调、无悬空或错位；f) 像素画风是否与水面/地形统一。请逐项简洁回答。');
  console.log('=== [1] 渔港码头建筑 ===\n' + r1 + '\n');

  // 2. 渔汛与渔获模态（状态头 / 十格图鉴 / 汛期进度条）
  const r2 = await ask(zai, b64(`${S}/v43_fishdex.png`),
    '这是同一游戏的一个弹窗面板截图，应为「渔汛与渔获」面板。请核对：a) 面板顶部状态头是否显示渔港/海鲜市场座数与汛期状态文案；b) 是否有一条青碧色的汛期进度条；c) 是否有十格渔获图鉴卡片（网格排布，每格有像素鱼头像与名字，部分已点亮部分灰置显示「？？？' + '」）；d) 已点亮卡片是否有「稀有」「镇册」徽章；e) 底部是否有说明文字（渔汛看天时/水质看环保等）；f) 中文文案是否清晰无乱码、布局有无错位溢出。请逐项简洁回答。');
  console.log('=== [2] 渔汛与渔获模态 ===\n' + r2 + '\n');

  // 3. 全城截图（渔船出海）
  const r3 = await ask(zai, b64(`${S}/v43_city.png`),
    '这是同一游戏的全城等距像素画面。请核对：a) 水面上是否有红棕色调的小渔船在航行（区别于白色渡轮与帆船，可能 1-2 艘）；b) 画面中是否可见渔港码头建筑（栈桥+渔船泊位）；c) 城市整体（道路/建筑/树木/水面）渲染是否正常无错乱；d) 顶栏是否有「渔」字指标芯片。请逐项简洁回答。');
  console.log('=== [3] 全城与渔船 ===\n' + r3 + '\n');

  // 4. 移动端适配
  const r4 = await ask(zai, b64(`${S}/v43_mobile.png`),
    '这是同一游戏的移动端 390×844 截图。请核对：a) 界面元素（顶栏芯片/侧栏按钮）是否在窄屏下正常排布无溢出；b) 若有弹窗面板，是否宽度适配屏幕、内容可读；c) 中文文案是否清晰；d) 整体布局有无错位或元素重叠。请逐项简洁回答。');
  console.log('=== [4] 移动端适配 ===\n' + r4 + '\n');
}

main().catch(e => { console.error(e); process.exit(1); });
