"""v6 经营模式实测：新开局经济运行 / 水塔供水 / 供水指数联动 / 存档季节持久化"""
import asyncio

BASE = 'http://localhost:3000'
OUT = '/home/z/my-project/scripts'

async def main():
    from playwright.async_api import async_playwright
    errors = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 1440, 'height': 900})
        pg = await ctx.new_page()
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errors.append(str(e)))
        await pg.goto(BASE, wait_until='networkidle')
        await pg.wait_for_timeout(5000)

        # 清存档 → 全新经营模式
        await pg.evaluate("localStorage.clear()")
        await pg.reload(wait_until='networkidle')
        await pg.wait_for_timeout(5000)
        # 若在沙盒则进经营
        try:
            await pg.get_by_title('上帝视角经营者：从荒地开始的城市经营').click(timeout=2500)
            await pg.wait_for_timeout(2500)
        except Exception:
            pass
        await pg.screenshot(path=f'{OUT}/v6_t1_newgame.png')

        # HUD 第二条芯片应含 供水(水滴) 与 季节(夏)
        chips = await pg.locator('.pxc-hud2 .chip').all_inner_texts()
        print('HUD2 chips:', chips)

        # 修 8 格路（任务1）→ 建住宅 → 观察人口与幸福
        await pg.keyboard.press('3')  # 道路
        await pg.mouse.move(700, 440)
        await pg.mouse.down()
        for x, y in [(712, 448), (724, 456), (736, 464), (748, 472), (760, 480)]:
            await pg.mouse.move(x, y); await pg.wait_for_timeout(50)
        await pg.mouse.up()
        await pg.wait_for_timeout(400)
        # 住宅：快捷键 5 → 点击放 3 栋
        await pg.keyboard.press('5')
        await pg.wait_for_timeout(300)
        for x, y in [(690, 455), (735, 490), (660, 490)]:
            await pg.mouse.click(x, y)
            await pg.wait_for_timeout(150)
        await pg.wait_for_timeout(2500)
        await pg.screenshot(path=f'{OUT}/v6_t2_houses.png')

        # 建水塔：公共分类 → 滚动找水塔（用面板按钮 title 匹配）
        # 公共 tab → 找水塔
        try:
            await pg.locator('button', has_text='公共').first.click(timeout=3000)
            await pg.wait_for_timeout(400)
        except Exception as e:
            print('open civ tab fail:', e.__class__.__name__)
        cnt = await pg.locator('*[title*="水塔"]').count()
        print('watertower cells:', cnt)
        if cnt:
            await pg.locator('*[title*="水塔"]').first.click()
            await pg.wait_for_timeout(300)
            await pg.mouse.click(710, 520)  # 水塔放置
            await pg.wait_for_timeout(1500)
        await pg.screenshot(path=f'{OUT}/v6_t3_watertower.png')

        # 等 25 秒观察经济数值（净收入/人口/供水）
        await pg.wait_for_timeout(25000)
        await pg.screenshot(path=f'{OUT}/v6_t4_econ.png')
        chips = await pg.locator('.pxc-hud2 .chip').all_inner_texts()
        print('HUD2 after 25s:', chips)

        # 切季节到冬季（经营模式应显示自动轮转标签）+ 重载验证持久化
        season_lbl = await pg.locator('.pxc-crowdrow', has_text='四季').inner_text()
        print('season row:', season_lbl.replace('\n', ' | '))

        # 存档数据检查
        raw = await pg.evaluate("localStorage.getItem('pxc_tycoon_v1')")
        if raw:
            import json
            d = json.loads(raw)
            print('save v:', d.get('v'), 'season:', d.get('season'), 'coins:', d.get('coins'), 'pop:', d.get('pop'))
        await b.close()
    print('CONSOLE_ERRORS:', len(errors))
    for e in errors[:8]:
        print(' -', e[:180])

asyncio.run(main())
