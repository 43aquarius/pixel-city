// v21_vlm.ts — 三张截图 VLM 复核（垃圾堆积层 / 三新建筑 / 全城协调）
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

  // 1. 垃圾堆积区特写
  const r1 = await ask(zai, b64(`${S}/v21_pile_closeup.png`),
    '这是一款复古等距像素城市经营游戏的截图，视角对准城市西南角的住宅区。该区域有 5 栋住宅建筑的垃圾无人清运（游戏设定：门口会堆积垃圾杂物）。请回答三个问题：1) 图中是否能看到建筑旁的垃圾堆积物（黑色垃圾袋/纸箱/瓶罐/白色杂物/贴地污渍等小像素团）？明显可见/隐约可见/不可见？2) 垃圾堆是否与建筑和地面区分明显（一眼能认出是垃圾而非装饰）？3) 是否存在渲染错乱（贴图撕裂/闪烁残影/像素错位）？请简洁回答。');
  console.log('=== [1] 垃圾堆积区 ===\n' + r1 + '\n');

  // 2. 三新建筑特写
  const r2 = await ask(zai, b64(`${S}/v21_newbldgs.png`),
    '这是复古等距像素城市经营游戏的截图。图中应有三类 v21 新建筑：1)「垃圾收集站」= 深绿翻盖垃圾箱排+低围挡+手推清运车；2)「回收中心」(2×2 大型) = 波纹铁皮屋顶分拣厂房+露天传送带+三垛打包方块；3)「焚烧发电厂」(2×2) = 大烟囱+倾斜给料漏斗+厂房。请逐一回答：各建筑是否可辨认（可辨认/不可辨认+原因）？像素画风是否与场景协调？有无渲染错乱？请简洁回答。');
  console.log('=== [2] 三新建筑 ===\n' + r2 + '\n');

  // 3. 全城协调
  const r3 = await ask(zai, b64(`${S}/v21_city.png`),
    '这是复古等距像素城市经营游戏的全城截图。请回答：1) 整体画面是否正常（无白屏/黑块/贴图错位/UI 破损）？2) 建筑与道路、绿化是否协调统一？3) 左下角或边缘若可见小堆杂物（垃圾堆积），是否自然不突兀？请简洁回答。');
  console.log('=== [3] 全城协调 ===\n' + r3 + '\n');
}

main().catch(e => { console.error('VLM 失败:', e?.message || e); process.exit(1); });
