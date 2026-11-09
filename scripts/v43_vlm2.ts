// v43_vlm2.ts — 补充复核（图鉴头像放大 / 渔港近景部件 / 顶栏渔芯片）
import ZAI, { VisionMessage } from 'z-ai-web-dev-sdk';
import * as fs from 'fs';

function b64(p: string): string {
  return 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');
}

async function ask(zai: Awaited<ReturnType<typeof ZAI.create>>, img: string, prompt: string): Promise<string> {
  const messages: VisionMessage[] = [
    { role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: img } }] },
  ];
  const response = await zai.chat.completions.createVision({
    model: 'glm-4.6v', messages, thinking: { type: 'disabled' },
  });
  return response.choices?.[0]?.message?.content ?? '(空回复)';
}

async function main(): Promise<void> {
  const zai = await ZAI.create();
  const S = '/home/z/my-project/scripts';

  const r1 = await ask(zai, b64(`${S}/v43_fishdex_crop.png`),
    '这是像素城市游戏「渔汛与渔获」面板的图鉴区放大截图。请核对：a) 每张图鉴卡左侧是否有一个像素风鱼/虾/蟹小头像（已点亮卡彩色、未点亮卡灰色剪影）；b) 头像是否能大致辨认出鱼形（如带尾鳍的鱼、横行的蟹）；c) 卡片名字（鲫鱼/青虾/鳜鱼等）与「？？？' + '」未录态是否清晰可辨；d) 有无头像缺失（空白卡）。请逐项简洁回答。');
  console.log('=== [1] 图鉴头像放大 ===\n' + r1 + '\n');

  const r2 = await ask(zai, b64(`${S}/v43_fishport_live_crop.png`),
    '这是像素城市游戏画面放大截图，画面中应有一座紧邻水面的「渔港码头」（2×2 建筑群）。请核对：a) 是否有伸向水面的木栈桥与桩柱；b) 栈桥或泊位旁是否停泊/航行着红棕色渔船；c) 岸侧是否有晒网架（立杆+格网）与渔获筐堆；d) 是否有灰顶鱼具房；e) 建筑是否紧贴水面（栈桥探入水中）；f) 画风与水面/地形是否协调。请逐项简洁回答。');
  console.log('=== [2] 渔港近景部件 ===\n' + r2 + '\n');

  const r3 = await ask(zai, b64(`${S}/v43_city.png`),
    '这是像素城市游戏的全城截图。请只核对一件事：画面顶部或侧边的指标芯片区中，是否有一个带「渔」字的芯片（可能与「航」「轨」「批」等字芯片并列，可能带数字）？如果有请描述它的样子与位置；如果确实没有也请明确说明。');
  console.log('=== [3] 顶栏渔芯片 ===\n' + r3 + '\n');
}

main().catch(e => { console.error(e); process.exit(1); });
