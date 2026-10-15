# 工作日志

---
Task ID: 1
Agent: 主 Agent (Super Z)
Task: 在当前工作区独立实现可直接运行的网页版复古等距城市建造沙盒「像素都市 PIXEL CITY」——自研风格化离线预渲染管线（程序化建模 → 2:1 等距正交光栅化 → 透明精灵图集）+ DOS/PC98 有限色板/有序抖动/扫描线/CRT 后处理 + 地图编辑与城市建造玩法 + 同年代复古 UI。

Work Log:
- 初始化 fullstack-dev 环境（Next.js 16 + TS + Tailwind），下载 Zpix 中文像素字体到 public/fonts（本地离线加载）
- 设计 66 色和谐有限色板 + 26 条渐变色阶(ramp) + Bayer 8×8 有序抖动（palette.ts）
- 实现种子随机/值噪声/分形噪声（rng.ts）
- 实现等距 2:1 正交投影与建模原语：盒体/双坡顶/四坡顶/四棱锥/棱柱/圆台/圆锥（geo.ts），面法线光 quantize 为 3 档明暗，视轴 D=(1,1,1) 剔除
- 实现面纹理图案库：窗格/砖/瓦楞/幕墙/瓦垄/看台人群/球场/石砌/格构/招牌/遮阳棚/树冠渐变等（patterns.ts）
- 实现软件光栅化器（softrender.ts）：扫描线填充 + 每像素反投影回 3D 平面求 UV + 图案采样 + 色板量化抖动 + 1px 暗色轮廓 + 足印接触阴影点阵，输出透明精灵；支持 r<0 透明像素（烟雾）；幽灵预览用 50% 棋盘遮罩
- 地面精灵工厂（terrain.ts）：世界坐标半开区间无缝平铺；草地/水(2帧动画)/沙 + 海岸沙滩过渡带与泡沫线；16 掩码道路自动拼接（人行道/侧石/虚线中线/磨耗噪声）；公园/广场/学校/神社/球场特殊地面（多格大菱形）
- 程序化建筑生成器 18 类：住宅 3（小宅/联排/公寓）、商业 3（商铺/写字楼/2×2摩天楼）、工业 3（2×2锯齿顶工厂含烟囱冒烟、2×2仓库、储油罐）、公共 9（公园/广场喷泉/2×2学校/2×2医院/2×2神社/3×3体育场双层看台碗/电视塔闪烁航标/纪念碑/树木×4）
- 地图数据层（map.ts）：64×64 网格、放置规则（水淹/伐树/整栋拆除）、随机地图 fbm 生成、序列化
- 引擎（engine.ts）：双通道渲染（地面平铺 + 按前角深度排序的对象）、相机/滚轮聚焦缩放(×1/2/3)、拖拽画笔插值、烟雾/航标/水面动画、小地图脏标记缓存、24 步撤销重做、localStorage 3 槽位存档 + 25s 自动存档、PNG 快照导出
- PC 喇叭方波音效合成（audio.ts）、22 个字符画像素图标（icons.ts）
- 复古 UI（PixelCity.tsx + pixelcity.css）：Win3.1/SC2000 银灰斜面面板、PC98 深蓝棋盘格标题栏、浮动工具条 11 工具、4 分类建筑目录网格（精灵缩略图）、存档/帮助模态、加载画面（NOW LOADING 进度条）、CRT 暗角 + 画布内对齐缩放级的扫描线、状态栏（坐标/提示/人口/建筑/道路/树木/FPS）
- 修复：patterns.ts 导入位置错误、bayer 错从 rng 导入、iconURI SSR 期访问 document、空 src 警告、ref 渲染期访问 lint 错误
- agent-browser 端到端验证：加载→放置 4 类建筑→画十字路网→存档→涂水→推土→撤销/重做→缩放×3→随机地图→导出→窄屏 480×800 响应式，全程零页面错误；VLM 视觉审查 5 轮（布局/建筑立体感/遮挡/道路拼接/像素细节/幽灵/烟雾/航标/配色/小地图）全部通过，60 FPS

Stage Summary:
- 交付物：可运行的复古等距城市建造沙盒（Next.js 16 / TypeScript / Canvas2D，纯客户端，无外部运行时依赖）
- 核心亮点：完全自研离线预渲染管线——18 类建筑全部代码程序化建模，启动时经固定 2:1 等距正交投影批量光栅化为透明精灵图集（可一键导出 PNG 图集），66 色有限色板 + Bayer 有序抖动统一全局观感
- 文件结构：src/lib/pixelcity/{palette,rng,geo,patterns,softrender,terrain,b_util,b_res,b_com,b_ind,b_civ,catalog,map,engine,audio,icons}.ts + pixelcity.css；src/components/PixelCity.tsx；app/page.tsx 与 layout.tsx 已更新
- 浏览器验证：HTTP 200、零控制台错误、lint 通过、桌面+窄屏布局正常、动画/存档/撤销/导出全部实测可用

---
Task ID: 2
Agent: 主 Agent (Super Z)
Task: 按用户三条新需求升级「像素都市」：①地图做大 ②一键生成城市 ③更多建筑与地形

Work Log:
- map.ts：地图 64²→128²；新增 TERR_FARM=3 / TERR_ROCK=4；序列化 v1→v2 游程编码（RLE，128² 存档仅 ~74KB）；deserialize 兼容 v1 明文 + 小图居中迁移到 128（旧 64² 存档自动放大居中）；新增 beginUpdate/endUpdate 批处理（生成器期间抑制逐次通知）；clearObjects() 清地上物保留地形；random() 新增岩石高地（v>0.615 且远离中心）与外围耕作带
- terrain.ts：新增 farm（金黄/翠绿作物行×两种行向=4 变体拼布 + 水缘泥边）、rock（碎石堆+岩顶受光+水缘砾滩）、parking（划线车位+中央车道+西侧车行入口）三种地面精灵
- b_extra.ts（新）：13 类建筑程序化建模——别墅府邸（四坡顶+绿篱+泳池）、住宅大厦 2×2（12-16 层挑阳台）、便利店、酒店 2×2、购物中心 2×2（玻璃中庭+天窗）、停车场（划线车位+彩色小车）、炼油厂 2×2（精馏塔林+火炬闪烁+冒烟）、火电厂 2×2（双曲线冷却塔白汽）、教堂（尖塔+十字）、博物馆 2×2（柱列+青绿穹顶）、消防局（红色卷闸门+晾塔）、灯塔（红白环纹+闪光）、城堡 2×2（雉堞城墙+门楼+角楼+主楼）
- catalog.ts：注册 13 类新建筑（31 类 75 变体总计）
- citygen.ts（新）：一键城市生成器——外环耕地带 → 道路网格（6-11 随机间距+中轴线）→ 距离/角度分区（核心商务/中层/郊区/外围/工业扇区）→ 17 种地标 tryPlace（纪念碑/广场/学校/医院/神社/教堂/消防局/城堡/体育场/电视塔/电厂/炼油/仓储/灯塔临水扫描）→ 分区密度填充 → 行道树/野生树；平地<25% 时报错返回
- engine.ts：CityMap(128)；Pass1 新增 farm/rock 渲染分支；小地图改 ImageData 直写（16k 格 <2ms）+ farm/rock 配色；平移速度 0.55→0.72；generateCity() 方法
- icons.ts：新增 city/farm/rock 像素图标
- PixelCity.tsx：目录面板新增「地形」页签（5 种地形大按钮）；工具条精简为 8 项；快捷键重排 1-8 + G=一键城市；市政操作新增「一键城市」主按钮（两行布局）；帮助/关于文案更新
- palette.ts：修复 RAMP as const 字面量类型传染（30+ 处 tsc 报错根因）；b_civ.ts 修复两处 frustum 多传参数
- 城市密度两轮调优（VLM 审查反馈"高楼森林"→ 路网间距 5-9→6-11、核心区覆盖率 80%→64%、各分区概率下调）
- 端到端验证（agent-browser + VLM）：加载 47-60 FPS；一键城市 2000 栋/4.2 万人口，西北角（郊区住宅+海岸）/东南角（工业+农田+岩石高地）VLM 审查分区清晰、呼吸感良好；耕地笔刷 VLM 确认条带纹理与清晰边界；灯塔/城堡放置形状正确；RLE v2 存档往返 ✓；v1 64² 旧档居中迁移 ✓（人口 5/建筑 1，house 渲染正常）；G 键 ✓；Ctrl+Z/Y ✓；图集导出 ✓；窄屏 480×850 ✓；控制台零错误；tsc 0 错误；eslint 通过

Stage Summary:
- 三条需求全部落地：128×128 大地图（旧档自动迁移）、一键城市（按钮/G 键，分区完备）、31 类建筑 + 7 种地形（新增耕地/岩石 + 停车场特殊地面）
- 交付物：可运行 Next.js 16 网页应用（纯客户端，无新运行时依赖）
- 关键文件：src/lib/pixelcity/{map,terrain,b_extra,citygen,catalog,engine,palette}.ts（改）；b_extra.ts / citygen.ts（新）；PixelCity.tsx / icons.ts（改）

---
Task ID: 3
Agent: 主 Agent (Super Z)
Task: 按用户新四条需求升级「像素都市」：①手机适配 ②各面板可收缩 ③地图更大+建筑面板内容更多 ④增加人物

Work Log:
- 手机适配：engine.ts 输入系统重写为多指针跟踪（pointers Map）——单指=工具/观察平移，双指=中点平移+距离分档捏合缩放（×1/×2/×3，比值阈值 1.30/0.77 带焦点）；setPointerCapture try/catch 防合成事件异常；移动端 attach() 默认 ×1 缩放（pointer:coarse 或短边<500）；layout.tsx viewport 加 user-scalable=no + viewport-fit=cover；CSS 100dvh + env(safe-area-inset-bottom) 安全区
- UI 移动端布局（PixelCity.tsx + pixelcity.css ≤820px）：底部横滚工具条（9 工具 50px 大按钮）、底部抽屉（把手含实时统计，展开 52vh 可滚动：建造/市政/小地图/关于）、紧凑标题栏（菜单+一键城市+行人开关）、toast/badge 重定位、帮助模态分触屏/桌面两套说明
- 面板全可收缩（需求②）：桌面右侧建造中心整板收缩为竖签（.pxc-paneltab）+ 四分组独立折叠（.pxc-ghead ▾/▸）；浮动工具条收为左缘小签（.pxc-tooltab）；标题栏最小化按钮真实生效（.pxc.min 细条+点击还原，状态栏隐藏）；移动端抽屉把手收放；全部状态经 useSyncExternalStore 外部存储持久化（localStorage pxc_ui_v1，水合安全零 SSR 不匹配）
- 修复两关键 bug：a) loadUi() 首渲染读 localStorage → 水合失败（SSR 默认 vs 客户端持久化不一致）→ 改 useSyncExternalStore(getServerSnapshot=默认值)；b) 移动端抽屉默认收起时小地图未挂载 → attach 卡死在加载页 → attach 改收 null mini + rebindMini() 断点/抽屉切换重绑
- 地图 128²→192²（map.ts MAP_N，旧 64/128 存档仍自动居中迁移）；色板 66→68 色（+樱花粉 2 色 SAKURA ramp）；树木 4→6 种（+樱花/棕榈/高乔木，addTree kind 3/4/5，genTree seed 低 3 位选种，小地图樱花显示粉色）
- 新建筑 12 类 23 变体（b_more.ts 新文件）：町屋（木格+暖帘+灯笼）、住宅小区 2×2（板楼+庭院树）、居酒屋（红灯笼串+霓虹招牌）、电影院 2×2（灯泡跑马廊+立式招牌塔+霓虹星）、屋台小吃街（遮阳棚+蒸汽 smokeAt）、木材厂 2×2（敞棚+3+2+1 原木垛+板材堆）、筒仓（竖肋筒体+天桥）、港口吊机 2×2（彩色集装箱阵+龙门吊+吊装集装箱，临水布置）、巴士站、钟楼（砖塔+双面大钟指针图案）、天文台 2×2（圆塔+两段穹顶+观测缝）、千本鸟居（三重朱红鸟居递进+石灯笼）；目录 43 类 98 变体
- actors.ts（新）：行人=7×13 字符画 ×4 朝向 ×2 步态帧 ×6 配色精确色板像素；车辆=复用等距建模软光栅化管线的小车模型（车身/底盘/玻璃座舱/四轮/前黄后红灯/出租车顶灯，4 方向×6 款）；ActorSystem 沿路网加权随机行走（直行权重 3、不掉头、死路掉头、无路移除）、按人口/道路数定目标规模（行人 10-90、车 4-24）、渐进出生裁减、车辆靠右车道偏移、与建筑同 key 参与画家算法深度排序；行人开关（标题栏按钮 + setCrowds + 徽标/状态栏计数）
- citygen.ts 适配 192²：路距随地图加宽（+1.6）、地标尝试次数随面积平方缩放、新地标（钟楼/天文台/千本鸟居/电影院/屋台×2）、港口吊机临水扫描、木材厂/筒仓入工业扇区、町屋入郊区外环、住宅小区入中环、居酒屋入核心沿街、巴士站沿路布置（n/22 个上限）
- 建筑面板增强：目录格子加名称标签（变体号）、面板体改滚动容器、关于文案更新（192×192·43 类·行人车辆）
- 端到端实测（agent-browser + VLM，全新会话零错误）：桌面加载 60FPS；一键城市 4400 栋/11.5 万人口/行人 90·车 24 涌现，VLM 确认樱花树/居酒屋/电影院/行人车辆可见；町屋放置 4439→4440；推土→放置链路 ✓；分组折叠/整板收缩/工具条收缩/最小化还原/持久化跨重载 ✓；行人开关关→开重生 ✓；移动端 390×844：×1 默认缩放、抽屉统计、双指捏合 ×1↔×2 合成事件实测生效、底部工具条选择+点击放置 ✓；存档 192² 保存/读取往返 ✓；水合 0 错误；tsc/lint 通过

Stage Summary:
- 四条需求全部落地：手机适配（双指手势+底部抽屉+横滚工具条+safe-area）、全面板可收缩（整板+分组+工具条+最小化，localStorage 持久化）、地图 192²+目录 43 类 98 变体（12 类新建筑+2 种新树）、行人车辆系统（像素行人+管线建模小车沿路网活动，可开关）
- 关键文件：b_more.ts / actors.ts（新）；map / palette / b_civ / catalog / citygen / engine / icons / PixelCity.tsx / pixelcity.css / layout.tsx（改）
- 修复：SSR 水合不匹配（useSyncExternalStore）、移动端无小地图卡加载（attach 收 null + rebindMini）、React Compiler memoization 推断（模块级 setUiStore）

---
Task ID: 4
Agent: 主 Agent (Super Z)
Task: 用户反馈"预览打不开"——排查并修复

Work Log:
- 诊断：ss 检查端口发现 3000 端口无进程监听（Caddy :81 代理正常、node_modules 完好），根因是 Next.js dev server 未运行（会话重启后进程丢失）
- 修复：nohup bun run dev 后台启动 dev server（tee 输出到 dev.log），Next.js 16.1.3 Turbopack 925ms 就绪
- 验证：直连 :3000 HTTP 200；经 Caddy :81 代理链路 HTTP 200 且标题「像素都市 PIXEL CITY」正常返回
- 端到端复查（agent-browser 无头浏览器）：页面加载零错误、零控制台报错；1440×900 截图经 VLM 确认等距地图/工具条/建造中心/小地图全部完整渲染，状态栏 60 FPS 正常运行

Stage Summary:
- 根因：dev server 进程未运行，非代码问题；已重新启动并全链路验证通过
- 服务器进程：bun run dev（next-server v16.1.3，PID 1299），日志见 dev.log

---
Task ID: 5
Agent: 主 Agent (Super Z)
Task: 按用户四条新需求升级「像素都市」：①行人更多+手动控制数量 ②建筑密度可调+优化 ③地图更大 ④地形种类更多

Work Log:
- actors.ts：行人配色 6→10 套（新增陶红/深青/米白/樱粉）；新增 pedAuto/pedManual 手动模式与 setPedTarget(auto,n)；自动上限 90→220、车辆 24→40、手动上限 300；生成/裁减加速（每周期最多 5 行人 / 3 车补充、6/4 裁减）；randomRoad 尝试 60→90
- citygen.ts：generateCity(map,seed,density=0.8) 密度参数化——全部分区填充阈值 ×dz、路距随密度加宽 (1-dz)*1.8、疏朗时行道树补植 green=0.10*(1-dz)；新地形分区规则：雪原疏落小村落（町屋/住宅/教堂，不受径向分区约束）、荒漠/沼泽留荒、花田/秋原同草地；地标排除荒漠/沼泽但允许雪原（雪山城堡）
- map.ts：MAP_N 192→256（小地图 512px）；新增 TERR_SNOW/FLOWER/DRY/SWAMP/AUTUMN(5-9)；random() 气候带生成——北部雪原(y<0.22)/南部秋原(y>0.80)/外围戈壁/滨海沼泽/耕地带花田；雪原森林以松树为主、秋原疏林阔叶；deserialize 地形范围 t<=9 兼容
- terrain.ts：5 种新地面精灵——雪（PBLUE 青灰阴影+CYAN 冰缘+闪光点）、花田（3×3 花畦红黄白粉青五色）、荒漠（DIRT 龟裂纹+砾石）、沼泽（暗苔藓+静水洼+芦苇）、秋原（TAN 金褐底+红/金/褐落叶）；KIND_IDX 12-16
- icons.ts：新增 snow/flower/dry/swamp/autumn 5 个 16×16 像素图标（等距菱形风格+新增 p 粉色）
- engine.ts：cityDensity 字段（generateCity 透传）；setPedTarget API；Pass1 渲染新增 5 地形分支（统一 edge=waterEdge）；小地图配色 snow #DCE6F0 / flower #A5C94F / dry #B99B62 / swamp #3F5F48 / autumn #C9924E
- PixelCity.tsx + pixelcity.css：UiState 增 pedsAuto/pedsN/density（localStorage 持久化，启动时恢复到引擎）；市政操作新增「密度」三档（疏朗 0.55/适中 0.8/繁华 1.05）与「行人」控制行（自动开关 + −/＋步进 20，上限 300）；setPeds 采用 store 函数式增量防连点丢步（setUiStore 同步更新模块变量后读取最终值传引擎）；TERR_OPTS 10 项（5×2 网格）；关于/帮助文案更新（256×256·10 地形·密度行人可调）；CSS 新增 .pxc-crowdrow/.pxc-lbl/.pxc-num/.pxc-btn.mini(.on)
- 端到端实测（agent-browser）：加载 60FPS 零错误；一键城市 256² 适中 6352 栋/16.5 万人、疏朗 4445 栋/11.5 万（树 1902 更多）、繁华 7332 栋/20.2 万——三档差异显著；行人自动达上限 220、手动 120→180→240→180 连点与收敛全部正确、重载持久化恢复；随机地图小地图像素统计：雪 4.3%/秋原 4.3%/花田 2.3%/沼泽 2.4%/荒漠 2.0% 全部生成；VLM 确认雪原（白+松树+明暗层次）/秋原（金褐+红叶）视觉正确；存档位往返精确恢复（树 3965）；移动端 390×844 抽屉/10 地形选项/雪地工具选择全通、零控制台错误；tsc src 0 错误、eslint 通过

Stage Summary:
- 四条需求全部落地：行人 10 配色+手动 0-300 可调（自动上限 220）、密度三档可调（默认 0.8 比旧版疏朗 20%）、地图 256×256（旧档自动居中迁移）、地形 5→10 种（雪原/花田/荒漠/沼泽/秋原，含气候带随机生成与城市生成适配）
- 关键文件：map/terrain/citygen/actors/engine/icons（改）+ PixelCity.tsx + pixelcity.css（改）
- 修复：行人步进连点丢步（store 函数式增量）

---
Task ID: 6
Agent: 主 Agent (Super Z)
Task: 用户反馈"预览打不开"——再次排查修复（会话重启后复发）

Work Log:
- 诊断：ss 显示 Caddy :81 正常监听但返回 502；:3000 无监听、无 bun/next 进程——dev server 进程再次丢失（会话重启连带回收）
- 首次尝试 nohup bun run dev：命令内 8 秒存活且双链路 200，但下一条 Bash 调用时进程已被杀——定位真因：普通 nohup 进程仍是持久 shell 的后代（PPID=shell），Bash 调用结束时整棵后代进程树被环境清理，nohup/disown 无效；setsid 单用也失败
- 修复：编写 scripts/start_dev.sh——daemon 化启动（setsid 新会话 + 后台 & + 启动 shell 立即退出 → 孤儿进程 reparent 到 PID 1 tini，脱离 Bash 调用进程树）；含幂等检查（:3000 已监听则跳过）+ pkill 清残留 + 最多 15s 就绪等待；PID 记录于 scripts/dev.pid
- 验证：脚本 1 秒 READY；跨 Bash 调用存活（ps 确认 PPID=1）；直连 :3000 与经 Caddy :81 均 HTTP 200
- 端到端复查（agent-browser）：页面加载零错误、零控制台报错，标题「像素都市 PIXEL CITY」正常；1440×900 截图 VLM 六项校验全通过：等距地图完整渲染、工具条/建造中心/小地图正常、状态栏 60 FPS、密度三档（疏朗/适中/繁华）与行人控制行在线、10 种地形面板在线（含雪地/花田/荒漠/沼泽/秋原）——Task 5 全部功能随代码完好保留，无渲染错误

Stage Summary:
- 根因：环境按 Bash 调用边界清理后代进程树，普通 nohup/disown 无法存活；此前偶发成功属竞态漏网
- 方案：scripts/start_dev.sh daemon 化启动（reparent to init），今后预览丢失时执行 `bash scripts/start_dev.sh` 即可秒级恢复
- 服务器状态：bun run dev PID 1383（PPID=1），双链路 200，Task 5 功能（256×256 地图/密度三档/行人 0-300 手动控制/10 地形）全部在线

---
Task ID: 7
Agent: 主 Agent (Super Z)
Task: 按用户第四轮三条需求升级「像素都市」：①行人精细化+智能化 ②建筑再扩 ③昼夜效果

Work Log:
- palette.ts：RAMPS 追加 NEONR[62]/NEONC[63]/LAMP[64,61] 三 ramp（27-29），日间外观与红/青一致；softrender.ts：RenderOpts.night 夜光模式 + nightPat 映射（GLASS/YELLOW→LAMP 暖光、NEONR→红、NEONC→青、其余透明），夜光精灵与日间同尺寸同锚点、自动关轮廓阴影
- actors.ts 全重写：行人精灵 7×13×2帧 → 10×17/8×14 多部件合成（H发/S肤/E眼/R上衣/r暗面/P裤/K鞋/C手杖/B书包），三体型（成人70%/儿童18%/长者12%——长者灰发+手杖+慢速，儿童快步+背书包，长发 look 背面补发），14 套配色×双肤色，4 朝向×双步态（4 帧循环），足影纳入精灵底部；行为升级：findPath BFS 目的地寻路（行人 16-72 格、车 30-150 格，2400 节点上限，失败退化加权随机）、到达逗留（行人 0.4-2.6s）、路口停顿（长者更久）、夜间人口回落（行人×0.3、车×0.45，手动模式不缩放）；车辆与行人补充改并行（修复车被 else-if 串行阻塞）；导出 lampModel() 路灯模型与 glowPool() 光晕
- b_dusk.ts（新 14 类 24 变体）：住宅高层公寓/长屋/民宿旅馆；商业电器街/摩天轮(makeFace 四叶轮+12段轮辋+8暖光吊舱)/烘焙坊/加油站/渡轮码头；工业风车磨坊/温室大棚/酿造厂；公共凉亭/水族馆/通信基站；大量 GLASS 夜光窗 + NEONR/NEONC 霓虹
- b_more.ts 霓虹换 ramp：町屋/居酒屋灯笼→NEONR、居酒屋招牌→NEONR/NEONC、电影院塔招牌→NEONR（日间像素不变）
- catalog.ts：+14 类目录、BuildingSprite.spNight 夜光精灵、SpriteBook.init 双渲染；citygen.ts：核心商业街加电器街、中环 hiapart/烘焙坊、郊区 nagaya/凉亭、外环 nagaya/民宿/凉亭/风车/温室、工业区酿造厂、新增加油站沿路布置与渡轮码头临水扫描、地标 aquarium/ferris/cellmast
- engine.ts 昼夜系统：timeOfDay 0-24 时钟（auto ×1/×2/×4 = 8/4/2 分钟一天）+ recomputeDayNight 明暗曲线（dark/warm 分段）；渲染管线：暮色暖光叠加 → 夜幕压暗(rgba13,17,42×0.58) → 'lighter' 夜光层（建筑 spNight 万家灯火、blinkAt 航标 halo、路灯灯头+地面光池、车头灯光束）；背景预渲染缓存（bgDay 点阵 + bgNight 星月，尺寸变化才重建——消除每帧 ~15k fillRect，×1 恢复流畅）；loop 内 dayness 回写 actors + 2.5s 周期 invalidate
- PixelCity.tsx：UiState 增 dayAuto/daySpeed/dayT（localStorage 持久化，每分钟回写当前时刻）；市政操作新增「昼夜」行（自动/手动 + 实时时钟）与「时速×1/×2/×4 + 场景晨午暮夜跳转」；状态栏/抽屉把手加时间显示；关于与帮助文案更新（动态统计 57 类 120 变体）
- 端到端实测（agent-browser + VLM）：一键城市 6708 栋/18.8 万人，行人 220·车 40 双满（并行修复生效）；深夜跳转：行人 220→66（=×0.3 精确命中）、车 40→18，VLM 确认夜氛围/万家灯火/路灯光晕/红青霓虹/车灯/暖橙暮色/无渲染错误（7/8，月亮为地图外缘彩蛋不可见属预期）；×3 行人精修 7/7（分色/身高差/步态/肤色/配色/无异常/车正常）；新建筑夜景 7/12 可见均正常 + 5 种经目录缩略图与像素统计验证（渡轮码头黑块系 VLM 误认，实测 279 内容像素形状正常）；移动端 390×844 夜间 60 FPS 零错误、昼夜行/时速/场景按钮全渲染；持久化重载恢复 dayT 并继续自动推进；tsc src 0 错误、eslint 通过
- 排障记录：①ensureBg 报错为 HMR 编辑中途残留（agent-browser errors 会话累积且 --clear 失效），全新会话验证 0 错误；②背景星点循环每帧数万 fillRect 致 ×1 掉帧 → 预渲染缓存修复（×2/×3 58-60 FPS、移动端 60 FPS，桌面 ×1 全城夜景 24 FPS 属极端角落场景）

Stage Summary:
- 三条需求全部落地：行人三体型 14 配色精细精灵 + BFS 智能寻路/路口停顿/夜间回家；目录 43→57 类 96→120 变体（14 种新建筑含摩天轮/电器街/水族馆/温室等夜光件）；完整昼夜循环（时钟 UI、暮暖夜蓝、万家灯火、路灯/车灯/霓虹、行人随夜色回落）
- 关键文件：b_dusk.ts（新）；palette/softrender/actors/b_more/catalog/citygen/engine/PixelCity.tsx（改）
- 性能：桌面 ×2/×3 与移动端全部 58-60 FPS；夜光管线为纯加色叠加，无 per-frame 重建
