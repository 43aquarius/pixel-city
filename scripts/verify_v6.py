"""v6 全面优化实测：加载 / 一键城市 / 四季切换 / 冬季封冻 / 桥梁架设 / 控制台错误捕获"""
import asyncio, sys

BASE = 'http://localhost:3000'
OUT = '/home/z/my-project/scripts'

async def main():
    from playwright.async_api import async_playwright
    errors = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1440, 'height': 900})
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errors.append(str(e)))

        await pg.goto(BASE, wait_until='networkidle')
        await pg.wait_for_timeout(5000)
        await pg.screenshot(path=f'{OUT}/v6_a_entry.png')

        # 进入沙盒模式（若当前为经营模式）
        try:
            await pg.get_by_title('自由建造无限制，经营进度独立保留').click(timeout=2000)
            await pg.wait_for_timeout(800)
        except Exception:
            pass
        # 一键城市
        await pg.keyboard.press('g')
        await pg.wait_for_timeout(2500)
        await pg.screenshot(path=f'{OUT}/v6_b_city.png')

        # 市政操作默认展开 → 直接点季节按钮（冬季）
        await pg.get_by_title('冬季：寒冬：粮食 −40%，取暖用电 +18%，水面封冻', exact=False).click(timeout=3000)
        await pg.wait_for_timeout(1500)
        await pg.screenshot(path=f'{OUT}/v6_c_winter.png')

        # 春季
        await pg.get_by_title('春季：春回大地：粮食产量 +15%，樱花开满枝头', exact=False).click(timeout=3000)
        await pg.wait_for_timeout(1500)
        await pg.screenshot(path=f'{OUT}/v6_d_spring.png')

        # 秋季
        await pg.get_by_title('秋季：金秋丰收：粮食产量 +25%，层林尽染', exact=False).click(timeout=3000)
        await pg.wait_for_timeout(1200)
        await pg.screenshot(path=f'{OUT}/v6_e_autumn.png')

        # ---- 桥梁测试：画面中心开水面 → 道路拖过 ----
        # 地形工具（快捷键 4）→ 选水域
        await pg.keyboard.press('4')
        await pg.wait_for_timeout(300)
        await pg.get_by_title('河流湖泊，会淹没地上物').click(timeout=3000)
        await pg.wait_for_timeout(300)
        # 中心 720,450 一带刷水（拖 5 格跨度）
        await pg.mouse.move(690, 430)
        await pg.mouse.down()
        for x, y in [(700, 440), (715, 452), (730, 464), (745, 476), (760, 488)]:
            await pg.mouse.move(x, y)
            await pg.wait_for_timeout(60)
        await pg.mouse.up()
        await pg.wait_for_timeout(600)
        # 道路工具（快捷键 3）→ 同一轨迹拖过水面
        await pg.keyboard.press('3')
        await pg.wait_for_timeout(300)
        await pg.mouse.move(690, 430)
        await pg.mouse.down()
        for x, y in [(700, 440), (715, 452), (730, 464), (745, 476), (760, 488)]:
            await pg.mouse.move(x, y)
            await pg.wait_for_timeout(60)
        await pg.mouse.up()
        await pg.wait_for_timeout(800)
        await pg.screenshot(path=f'{OUT}/v6_f_bridge.png')

        # 切冬季看冰面 + 桥（雪桥效果）
        await pg.get_by_title('冬季：寒冬：粮食 −40%，取暖用电 +18%，水面封冻', exact=False).click(timeout=3000)
        await pg.wait_for_timeout(1200)
        await pg.screenshot(path=f'{OUT}/v6_g_bridge_winter.png')

        # 移动端视口
        await pg.set_viewport_size({'width': 390, 'height': 844})
        await pg.wait_for_timeout(1200)
        await pg.screenshot(path=f'{OUT}/v6_h_mobile.png')

        await b.close()
    print('CONSOLE_ERRORS:', len(errors))
    for e in errors[:10]:
        print(' -', e[:200])

asyncio.run(main())
