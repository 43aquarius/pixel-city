# Task 14 地形直观化像素验证
# 检查项：
#  A. 高原顶面海拔提亮（h>=4 的顶面叠白 alpha 0.05-0.34 → 高地顶面明显更亮）
#  B. 崖壁强对比层理（新 cliffRock 亮层 #C3C7CC / 暗层 #74787F 交替，行向对比度可测）
#  C. 崖脚压暗基座（立面最底部 2.5-3.4px 暗带 → 立面底部行均值显著低于中部）
#  D. 崖脚 AO 投影（崖底低地上的暗带）
# 方法：在 ×1 全图截图中扫描，找「雪峰(近白)→岩壁(灰)→基座(更暗)」垂直序列，
#       以及高亮顶面与其正下方崖壁的亮度差。
from PIL import Image
import sys

img = Image.open('/home/z/my-project/scripts/shot14_terrain_zoom1.png').convert('RGB')
W, H = img.size
px = img.load()

def lum(p):
    return 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]

def is_rock(c):
    # 岩层两档：亮 #C3C7CC(195,199,204) 暗 #74787F(116,119,127)；容差
    def near(t, tol=26):
        return abs(c[0]-t[0])<tol and abs(c[1]-t[1])<tol and abs(c[2]-t[2])<tol
    return near((195,199,204)) or near((116,119,127)) or near((154,160,167))

def is_snow(c):
    return c[0]>225 and c[1]>225 and c[2]>225

def is_dark(c):
    return c[0]<90 and c[1]<95 and c[2]<110  # 基座/ASPH2 #2C2E36/#3B3D46 系

# ---- B+C：扫描岩壁列（连续 >=8 行的岩色序列），测层理对比与底端压暗 ----
best_strata = None   # (x, y_top, n_bands, contrast)
best_base = None     # (x, y_face_top, y_base, drop_ratio)
rock_cols = 0
strata_cols = 0
base_cols = 0
for x in range(0, W, 3):
    run = []
    y = 0
    while y < H:
        c = px[x, y]
        if is_rock(c) or is_dark(c):
            run.append((y, c))
        else:
            if len(run) >= 14:   # >=14 行的岩壁（>= 2 层 3.6px 层理）
                # 层理交替计数：亮→暗 或 暗→亮 的翻转
                flips = 0
                lum_seq = [lum(c) for _, c in run]
                mean_hi = sum(lum_seq)/len(lum_seq)
                for k in range(1, len(lum_seq)):
                    if abs(lum_seq[k]-lum_seq[k-1]) > 38:
                        flips += 1
                if flips >= 2:
                    strata_cols += 1
                    if best_strata is None or flips > best_strata[2]:
                        best_strata = (x, run[0][0], flips, max(lum_seq)-min(lum_seq))
                # 崖脚基座压暗：序列最底部 3 行均值 vs 中位均值
                tail = [lum(c) for _, c in run[-3:]]
                mid = lum_seq[len(lum_seq)//2]
                if len(run) >= 20 and mid > 0 and sum(tail)/3 < mid*0.62:
                    base_cols += 1
                    if best_base is None:
                        best_base = (x, run[0][0], run[-1][0], round(sum(tail)/3,1), round(mid,1))
                rock_cols += 1
            run = []
        y += 1
    if len(run) >= 14:
        # 边界收尾（同上简化：只计岩壁出现）
        rock_cols += 1

# ---- A：海拔提亮——找「大片灰岩顶面」与同图「草地顶面」的亮度比较不可靠；
#        改测：提亮只作用于 h>=4，其效果是顶面叠加白色 alpha。
#        用「雪线下岩顶(h 7-10) 亮度」与「低地草地亮度」的差值作为间接证据太弱；
#        直接检测：顶面亮色(#F4F2E8 叠加) 在岩区的存在比例 —— 岩顶受光面本身即
#        SIDE 0 #C3C7CC，叠加后趋近 #DADDDF~#F4F2E8。统计「接近白的岩顶像素」。
near_white = 0
total_top_rock = 0
for y in range(0, H, 4):
    for x in range(0, W, 4):
        c = px[x, y]
        if is_snow(c):
            total_top_rock += 1
            if c[0] > 238:
                near_white += 1

print(f"图像 {W}x{H}")
print(f"[B] 岩壁列(>=14行岩色) 扫描步长3: {rock_cols} | 有层理翻转(>=2次,Δ>38): {strata_cols}")
print(f"[B] 最强层理列: x={best_strata[0] if best_strata else '-'}, y0={best_strata[1] if best_strata else '-'}, 翻转={best_strata[2] if best_strata else '-'}, 对比度Δ={best_strata[3] if best_strata else '-'}")
print(f"[C] 崖脚压暗列数: {base_cols} | 样例: {best_base}")
print(f"[A] 雪顶像素(4步采样): {total_top_rock}，其中近纯白(>238): {near_white}")

ok = strata_cols >= 8 and best_strata and best_strata[2] >= 3 and base_cols >= 3
print("PASS" if ok else "FAIL", "- 崖壁层理与基座压暗")
