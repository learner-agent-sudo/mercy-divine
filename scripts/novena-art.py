"""九日敬禮的四張聖像，和首頁讀經、九日敬禮、修和聖事三張卡片的預設圖（原創向量圖）。
用法: python3 scripts/novena-art.py images"""
import math, sys, os

OUT = sys.argv[1]
W, H = 300, 400
f = lambda v: f'{v:.1f}'.rstrip('0').rstrip('.')


def pt(x, y):
    return f'{f(x)},{f(y)}'


def frame_defs(top, bottom, glow, glow_at=(0.5, 0.4), glow_r=0.6):
    return f'''<defs>
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{top}"/><stop offset="1" stop-color="{bottom}"/></linearGradient>
<radialGradient id="glow" cx="{glow_at[0]}" cy="{glow_at[1]}" r="{glow_r}"><stop offset="0" stop-color="{glow}" stop-opacity=".85"/><stop offset=".45" stop-color="{glow}" stop-opacity=".25"/><stop offset="1" stop-color="{glow}" stop-opacity="0"/></radialGradient>
<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F6DE9A"/><stop offset=".5" stop-color="#CFA052"/><stop offset="1" stop-color="#93682A"/></linearGradient>
<linearGradient id="goldv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FBE7AE"/><stop offset=".55" stop-color="#D9AC5C"/><stop offset="1" stop-color="#9C6F2C"/></linearGradient>
<clipPath id="card"><rect width="{W}" height="{H}" rx="18"/></clipPath>
'''


def frame_open():
    return (f'<rect width="{W}" height="{H}" rx="18" fill="url(#bg)"/>'
            f'<g clip-path="url(#card)"><rect width="{W}" height="{H}" fill="url(#glow)"/>')


def frame_close():
    # 雙金框，四角各一顆小菱形
    s = '</g>'
    s += f'<rect x="10" y="10" width="{W-20}" height="{H-20}" rx="12" fill="none" stroke="url(#gold)" stroke-width="2.2"/>'
    s += f'<rect x="17" y="17" width="{W-34}" height="{H-34}" rx="8" fill="none" stroke="url(#gold)" stroke-width=".8" opacity=".75"/>'
    for (x, y) in ((17, 17), (W - 17, 17), (17, H - 17), (W - 17, H - 17)):
        s += f'<path d="M{pt(x, y-5)}L{pt(x+5, y)}L{pt(x, y+5)}L{pt(x-5, y)}Z" fill="url(#gold)"/>'
    return s


def rays(cx, cy, n, r0, r1, width_deg, color, opacity, start=0, alt=None, span=360):
    out = []
    for i in range(n):
        a = math.radians(start + i * span / n)
        w = math.radians(width_deg)
        rr = r1 if not alt or i % 2 == 0 else alt
        p1 = (cx + r0 * math.cos(a - w / 4), cy + r0 * math.sin(a - w / 4))
        p2 = (cx + rr * math.cos(a - w / 2), cy + rr * math.sin(a - w / 2))
        p3 = (cx + rr * math.cos(a + w / 2), cy + rr * math.sin(a + w / 2))
        p4 = (cx + r0 * math.cos(a + w / 4), cy + r0 * math.sin(a + w / 4))
        out.append(f'M{pt(*p1)}L{pt(*p2)}L{pt(*p3)}L{pt(*p4)}Z')
    return f'<path d="{"".join(out)}" fill="{color}" opacity="{opacity}"/>'


def star(cx, cy, r, ri=None, n=5, rot=-90):
    ri = ri or r * 0.42
    ps = []
    for i in range(2 * n):
        a = math.radians(rot + i * 180 / n)
        rr = r if i % 2 == 0 else ri
        ps.append(pt(cx + rr * math.cos(a), cy + rr * math.sin(a)))
    return 'M' + 'L'.join(ps) + 'Z'


def flame(cx, base, h, w):
    """一朵火焰：底圓、頂尖，稍微彎"""
    return (f'M{pt(cx, base)}'
            f'C{pt(cx - w, base)} {pt(cx - w * 1.05, base - h * .45)} {pt(cx - w * .35, base - h * .7)}'
            f'C{pt(cx - w * .1, base - h * .82)} {pt(cx + w * .15, base - h * .9)} {pt(cx + w * .05, base - h)}'
            f'C{pt(cx + w * .75, base - h * .72)} {pt(cx + w * 1.05, base - h * .4)} {pt(cx + w * .85, base - h * .18)}'
            f'C{pt(cx + w * .7, base - h * .02)} {pt(cx + w * .4, base)} {pt(cx, base)}Z')


def write(name, body):
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">{body}</svg>\n'
    open(os.path.join(OUT, name), 'w').write(svg)


# ── 天主聖神：降臨的鴿子、光芒、七道火舌 ─────────────────────
def dove():
    # 以 (0,0) 為身體中心，頭朝下（降臨），翅膀左右張開
    def wing(side):
        s = side
        top = [(-8, -14), (-40, -46), (-88, -58), (-122, -44)]
        # 下緣的羽毛：從翼尖回到身體，一片一片的圓弧
        tips = [(-122, -44), (-112, -22), (-98, -6), (-82, 6), (-64, 14), (-46, 18), (-28, 18), (-12, 12)]
        d = f'M{pt(s * top[0][0], top[0][1])}C{pt(s * top[1][0], top[1][1])} {pt(s * top[2][0], top[2][1])} {pt(s * top[3][0], top[3][1])}'
        for (x0, y0), (x1, y1) in zip(tips, tips[1:]):
            mx, my = (x0 + x1) / 2, (y0 + y1) / 2
            # 往外（下）鼓出一點，像羽毛的尖
            nx, ny = (y1 - y0), -(x1 - x0)
            L = math.hypot(nx, ny) or 1
            k = 9
            d += f'Q{pt(s * (mx - nx / L * k), my - ny / L * k)} {pt(s * x1, y1)}'
        d += 'Z'
        # 羽毛的分隔線
        lines = ''
        for (x, y) in tips[1:-1]:
            lines += f'M{pt(s * x, y)}L{pt(s * (x * .55 - 4), y * .4 - 18)}'
        return d, lines

    parts = []
    for side in (-1, 1):
        d, lines = wing(side)
        parts.append(f'<path d="{d}" fill="#FFF9EC" stroke="#E9C989" stroke-width="1.2" stroke-linejoin="round"/>')
        parts.append(f'<path d="{lines}" stroke="#E2C48A" stroke-width="1" fill="none" stroke-linecap="round" opacity=".9"/>')
    # 尾巴（在上方），扇形
    tail = f'M{pt(-10, -18)}L{pt(-22, -66)}Q{pt(-11, -60)} {pt(0, -70)}Q{pt(11, -60)} {pt(22, -66)}L{pt(10, -18)}Z'
    parts.insert(0, f'<path d="{tail}" fill="#FFF9EC" stroke="#E9C989" stroke-width="1.2" stroke-linejoin="round"/>')
    parts.append(f'<path d="M-7,-58L-4,-24M0,-66L0,-22M7,-58L4,-24" stroke="#E2C48A" stroke-width="1" fill="none"/>')
    # 身體與頭
    parts.append('<ellipse cx="0" cy="0" rx="17" ry="30" fill="#FFFDF6" stroke="#E9C989" stroke-width="1.2"/>')
    parts.append('<circle cx="0" cy="34" r="12.5" fill="#FFFDF6" stroke="#E9C989" stroke-width="1.2"/>')
    parts.append('<path d="M-4,45L0,55L4,45Z" fill="#E1A94F"/>')
    return ''.join(parts)


def spirit():
    cx, cy = 150, 168
    b = frame_defs('#6E1218', '#2A0609', '#FFD98A', (0.5, 0.42), 0.62)
    b += '<radialGradient id="fire" cx=".5" cy=".85" r=".9"><stop offset="0" stop-color="#FFF2B8"/><stop offset=".45" stop-color="#FFB443"/><stop offset="1" stop-color="#E2531F"/></radialGradient></defs>'
    b += frame_open()
    b += rays(cx, cy, 36, 30, 260, 4.2, '#FFE7A8', .2, alt=200)
    b += rays(cx, cy, 12, 40, 250, 1.2, '#FFF4D2', .25, start=15)
    b += f'<circle cx="{cx}" cy="{cy}" r="78" fill="none" stroke="#FFE3A0" stroke-width="1" opacity=".5"/>'
    b += f'<circle cx="{cx}" cy="{cy}" r="58" fill="#FFE9B3" opacity=".22"/>'
    b += f'<g transform="translate({cx} {cy}) scale(.92)">{dove()}</g>'
    # 七道火舌（聖神七恩），在下方排成弧形
    for i in range(7):
        a = math.radians(200 + i * 140 / 6 - 70 + 90 - 200 + 90)  # 從左下到右下
    fl = ''
    for i in range(7):
        t = -1 + i / 3
        x = cx + t * 92
        y = 316 - (1 - t * t) * 26
        h = 34 - abs(t) * 6
        fl += f'<path d="{flame(x, y, h, 9)}" fill="url(#fire)" stroke="#FFD27A" stroke-width=".6"/>'
    b += fl
    b += frame_close()
    write('novena-spirit.svg', b)


# ── 無玷始胎：月亮、十二星冠、百合 ─────────────────────────
def lily(x, y, s):
    # 一枝百合：莖、葉、三片花瓣的喇叭花、兩個花苞
    g = f'<g transform="translate({x} {y}) scale({s})">'
    g += '<path d="M0,120C2,80 -2,40 0,0" stroke="#7FA36B" stroke-width="3.2" fill="none" stroke-linecap="round"/>'
    for (yy, side) in ((95, -1), (78, 1), (60, -1), (44, 1)):
        g += (f'<path d="M0,{yy}C{side*10},{yy-8} {side*22},{yy-10} {side*30},{yy-20}'
              f'C{side*20},{yy-6} {side*10},{yy-1} 0,{yy+2}Z" fill="#8DB277"/>')
    # 花（向上開）
    g += '<path d="M0,6C-6,-8 -22,-20 -30,-44C-16,-34 -6,-30 0,-14C6,-30 16,-34 30,-44C22,-20 6,-8 0,6Z" fill="#FFFFFF" stroke="#E6DCC4" stroke-width="1"/>'
    g += '<path d="M0,4C-4,-16 -4,-36 0,-56C4,-36 4,-16 0,4Z" fill="#FFFDF5" stroke="#E6DCC4" stroke-width="1"/>'
    g += '<path d="M-2,-10L-6,-32M2,-10L6,-32M0,-10L0,-36" stroke="#D9A441" stroke-width="1.3"/>'
    g += '<circle cx="-6" cy="-33" r="2" fill="#C9862E"/><circle cx="6" cy="-33" r="2" fill="#C9862E"/><circle cx="0" cy="-37" r="2" fill="#C9862E"/>'
    # 花苞
    for (bx, by, rot) in ((-14, 26, -28), (14, 18, 26)):
        g += (f'<g transform="translate({bx} {by}) rotate({rot})"><path d="M0,10C-5,0 -4,-12 0,-20C4,-12 5,0 0,10Z" fill="#FBF6E8" stroke="#E6DCC4"/></g>'
              f'<path d="M0,{by + 18}Q{bx * .6},{by + 14} {bx},{by + 10}" stroke="#7FA36B" stroke-width="2" fill="none"/>')
    return g + '</g>'


def immaculate():
    cx = 150
    b = frame_defs('#1F3F78', '#0A1631', '#FFF6D8', (0.5, 0.42), 0.55)
    b += '<radialGradient id="sun" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFF8DC"/><stop offset=".6" stop-color="#FFE8A6" stop-opacity=".55"/><stop offset="1" stop-color="#FFE8A6" stop-opacity="0"/></radialGradient>'
    b += '<linearGradient id="moon" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#F8F1D8"/><stop offset="1" stop-color="#D8C38B"/></linearGradient></defs>'
    b += frame_open()
    # 披著太陽：身後的光芒
    b += rays(cx, 190, 40, 40, 230, 3.4, '#FFF1C4', .14, alt=170)
    b += f'<circle cx="{cx}" cy="190" r="92" fill="url(#sun)"/>'
    # 十二顆星，排成上方的弧
    stars = ''
    for i in range(12):
        a = math.radians(180 + 12 + i * (180 - 24) / 11)
        x, y = cx + 112 * math.cos(a), 168 + 112 * math.sin(a) * .82
        stars += star(x, y, 8.5)
    b += f'<path d="{stars}" fill="url(#gold)" stroke="#FFF2C6" stroke-width=".6"/>'
    # 百合
    b += lily(cx, 182, 1.3)
    # 腳下的月亮（新月，角朝上）
    b += f'<path d="M{pt(cx - 78, 318)}C{pt(cx - 60, 362)} {pt(cx + 60, 362)} {pt(cx + 78, 318)}C{pt(cx + 50, 344)} {pt(cx - 50, 344)} {pt(cx - 78, 318)}Z" fill="url(#moon)" stroke="#FFF6DC" stroke-width=".8"/>'
    b += frame_close()
    write('novena-immaculate.svg', b)


# ── 進教之佑：冠冕、聖母名號 M、月桂環 ───────────────────
def crown(cx, cy, w):
    s = w / 100
    g = f'<g transform="translate({cx} {cy}) scale({f(s)})">'
    # 冠身
    g += ('<path d="M-50,30L-56,-18L-30,4L-16,-30L0,0L16,-30L30,4L56,-18L50,30Z" fill="url(#goldv)" stroke="#7A5420" stroke-width="1.6" stroke-linejoin="round"/>')
    g += '<rect x="-52" y="26" width="104" height="16" rx="3" fill="url(#goldv)" stroke="#7A5420" stroke-width="1.6"/>'
    for x in (-34, -12, 12, 34):
        g += f'<circle cx="{x}" cy="34" r="3.6" fill="#B3262E" stroke="#5E1216" stroke-width=".8"/>'
    g += '<circle cx="0" cy="34" r="0" />'
    for (x, y) in ((-56, -18), (-16, -30), (16, -30), (56, -18)):
        g += f'<circle cx="{x}" cy="{y}" r="4.4" fill="#FFF6DA" stroke="#7A5420" stroke-width="1"/>'
    # 頂上的十字架
    g += '<path d="M-4,-26L4,-26L4,-38L12,-38L12,-46L4,-46L4,-56L-4,-56L-4,-46L-12,-46L-12,-38L-4,-38Z" fill="url(#goldv)" stroke="#7A5420" stroke-width="1.2"/>'
    g += '<circle cx="0" cy="-18" r="6" fill="#2F64B5" stroke="#7A5420" stroke-width="1"/>'
    return g + '</g>'


def monogram_m(cx, cy, h):
    s = h / 100
    # 有襯線的 M：兩根柱子、中間的 V
    d = ('M-46,50L-46,46L-38,44L-38,-40L-46,-44L-46,-50L-22,-50L0,12L22,-50L46,-50L46,-44L38,-40L38,44L46,46L46,50'
         'L14,50L14,46L22,44L22,-22L2,36L-2,36L-22,-22L-22,44L-14,46L-14,50Z')
    return (f'<g transform="translate({cx} {cy}) scale({f(s)})">'
            f'<path d="{d}" fill="url(#goldv)" stroke="#6B4818" stroke-width="1.6" stroke-linejoin="round"/></g>')


def laurel(cx, cy, r):
    g = ''
    for side in (-1, 1):
        stem = []
        for i in range(15):
            a = math.radians(110 + i * 9.2)
            x = cx + side * -r * math.cos(a)
            y = cy + r * math.sin(a) * 1.05
            stem.append((x, y))
        g += '<path d="M' + 'L'.join(pt(*p) for p in stem) + '" stroke="#C49A4E" stroke-width="2" fill="none"/>'
        for i, (x, y) in enumerate(stem[1:], 1):
            a = math.atan2(y - stem[i - 1][1], x - stem[i - 1][0])
            for o in (-1, 1):
                aa = a + o * 0.75
                lx, ly = x + 13 * math.cos(aa), y + 13 * math.sin(aa)
                g += (f'<path d="M{pt(x, y)}Q{pt((x + lx) / 2 + 4 * math.cos(aa + 1.57), (y + ly) / 2 + 4 * math.sin(aa + 1.57))} {pt(lx, ly)}'
                      f'Q{pt((x + lx) / 2 - 4 * math.cos(aa + 1.57), (y + ly) / 2 - 4 * math.sin(aa + 1.57))} {pt(x, y)}Z" fill="#9DBE7A" stroke="#6E8E4E" stroke-width=".5"/>')
    return g


def auxilium():
    cx = 150
    b = frame_defs('#173A86', '#0B1940', '#FFE7A6', (0.5, 0.45), 0.6)
    b += '</defs>'
    b += frame_open()
    b += rays(cx, 214, 32, 70, 240, 4, '#FFE9B0', .13, alt=190)
    b += f'<circle cx="{cx}" cy="214" r="86" fill="#FFF1C9" opacity=".12"/>'
    b += laurel(cx, 214, 92)
    b += monogram_m(cx, 220, 108)
    b += crown(cx, 108, 92)
    # 兩顆小星：海星（聖母）
    b += f'<path d="{star(70, 74, 7)}{star(230, 74, 7)}{star(cx, 338, 9)}" fill="url(#gold)"/>'
    b += frame_close()
    write('novena-auxilium.svg', b)


# ── 煉靈：上方的光、十字架、蠟燭、下方的火 ──────────────────
def souls():
    cx = 150
    b = frame_defs('#2E2147', '#120B1E', '#FFE6A8', (0.5, 0.08), 0.75)
    b += ('<linearGradient id="wax" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#E9DFC8"/><stop offset=".45" stop-color="#FFFDF5"/><stop offset="1" stop-color="#D7CBB0"/></linearGradient>'
          '<radialGradient id="cflame" cx=".5" cy=".75" r=".8"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".35" stop-color="#FFF0A8"/><stop offset="1" stop-color="#FF9A2E"/></radialGradient>'
          '<radialGradient id="halo" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFE9A8" stop-opacity=".75"/><stop offset="1" stop-color="#FFE9A8" stop-opacity="0"/></radialGradient>'
          '<linearGradient id="purg" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#C2361F"/><stop offset=".6" stop-color="#F08A2E"/><stop offset="1" stop-color="#FFD36B"/></linearGradient>'
          '<linearGradient id="ember" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#E2531F" stop-opacity=".55"/><stop offset="1" stop-color="#E2531F" stop-opacity="0"/></linearGradient></defs>')
    b += frame_open()
    # 從上面照下來的光
    b += rays(cx, -30, 22, 30, 470, 3.2, '#FFEFC2', .13, start=50, span=80, alt=380)
    # 十字架
    b += f'<path d="M{pt(cx - 4, 34)}H{f(cx + 4)}V50H{f(cx + 16)}V58H{f(cx + 4)}V96H{f(cx - 4)}V58H{f(cx - 16)}V50H{f(cx - 4)}Z" fill="url(#gold)" stroke="#FFF0C4" stroke-width=".6"/>'
    # 蠟燭的光暈與燭火
    b += f'<circle cx="{cx}" cy="168" r="62" fill="url(#halo)"/>'
    b += f'<path d="{flame(cx, 186, 46, 11)}" fill="url(#cflame)"/>'
    b += f'<path d="M{pt(cx, 186)}L{pt(cx, 194)}" stroke="#3A2A1A" stroke-width="2"/>'
    # 燭身與燭台
    b += f'<rect x="{cx - 17}" y="194" width="34" height="98" rx="3" fill="url(#wax)"/>'
    b += f'<path d="M{pt(cx - 17, 198)}Q{pt(cx - 8, 204)} {pt(cx - 6, 196)}Q{pt(cx - 4, 214)} {pt(cx - 1, 200)}" stroke="#F3EBD6" stroke-width="3" fill="none" stroke-linecap="round"/>'
    b += f'<path d="M{pt(cx - 36, 292)}H{f(cx + 36)}L{pt(cx + 26, 302)}H{f(cx - 26)}Z" fill="url(#gold)"/>'
    b += f'<rect x="{cx - 8}" y="302" width="16" height="10" fill="url(#gold)"/>'
    # 下方的火（煉獄），前後兩層
    b += f'<rect x="0" y="300" width="{W}" height="100" fill="url(#ember)"/>'
    back = ''.join(f'<path d="{flame(x, 392, h, 15)}"/>' for x, h in
                   ((20, 62), (52, 80), (86, 56), (214, 58), (248, 82), (282, 60)))
    b += f'<g fill="url(#purg)" opacity=".55">{back}</g>'
    front = ''.join(f'<path d="{flame(x, 398, h, 13)}"/>' for x, h in
                    ((34, 44), (66, 58), (98, 40), (126, 30), (174, 30), (202, 42), (234, 60), (266, 46)))
    b += f'<g fill="url(#purg)" opacity=".9">{front}</g>'
    b += frame_close()
    write('novena-souls.svg', b)


# ── 首頁卡片：讀經（打開的聖經、光芒、基督名號 ☧）──────────────
def chi_rho(cx, cy, s):
    g = f'<g transform="translate({cx} {cy}) scale({f(s)})" fill="none" stroke="#E2B865" stroke-linecap="round" stroke-linejoin="round">'
    g += '<path d="M0,-44V44" stroke-width="7"/>'
    g += '<path d="M0,-44C24,-44 26,-14 0,-14" stroke-width="7"/>'
    g += '<path d="M-24,-6L24,38M24,-6L-24,38" stroke-width="6.5"/>'
    return g + '</g>'


def open_book(cx, cy):
    # 以書脊的中點為 (0,0)：兩頁往外微微翹起，下面一層深紅的封皮，書脊垂下一條紅絲帶
    g = f'<g transform="translate({cx} {cy})">'
    g += '<path d="M0,-26C-30,-38 -70,-38 -100,-24L-104,52C-70,40 -30,42 0,56C30,42 70,40 104,52L100,-24C70,-38 30,-38 0,-26Z" fill="#6E1A1E" stroke="url(#gold)" stroke-width="2"/>'
    for side in (-1, 1):
        s = side
        page = (f'M0,-22C{f(s*28)},-34 {f(s*64)},-34 {f(s*94)},-22L{f(s*96)},44C{f(s*66)},34 {f(s*30)},36 0,48Z')
        g += f'<path d="{page}" fill="url(#page)" stroke="#D8C79F" stroke-width="1"/>'
        lines = ''
        for i in range(7):
            y0 = -14 + i * 8.6
            lines += f'M{f(s*12)},{f(y0 + 2)}Q{f(s*48)},{f(y0 - 7)} {f(s*84)},{f(y0 - 1)}'
        g += f'<path d="{lines}" stroke="#BCA97F" stroke-width="1.3" fill="none" stroke-linecap="round" opacity=".75"/>'
    g += '<path d="M0,-22V48" stroke="#B9A374" stroke-width="1.4"/>'
    g += '<path d="M-3,46L-6,92L0,84L6,92L3,46Z" fill="#B3262E" stroke="#6E1216" stroke-width=".8"/>'
    return g + '</g>'


def section_bible():
    cx = 150
    b = frame_defs('#1E4A3C', '#091B15', '#FFE9B0', (0.5, 0.5), 0.62)
    b += '<linearGradient id="page" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFBEF"/><stop offset="1" stop-color="#EBDDBB"/></linearGradient></defs>'
    b += frame_open()
    b += rays(cx, 236, 34, 34, 300, 3.4, '#FFF0C4', .16, start=180, span=180, alt=230)
    b += f'<circle cx="{cx}" cy="128" r="58" fill="#FFF1C9" opacity=".12"/>'
    b += f'<circle cx="{cx}" cy="128" r="48" fill="none" stroke="#FFE3A0" stroke-width="1" opacity=".55"/>'
    b += chi_rho(cx, 128, .82)
    b += open_book(cx, 262)
    b += f'<path d="{star(64, 70, 6)}{star(236, 70, 6)}" fill="url(#gold)"/>'
    b += frame_close()
    write('section-bible.svg', b)


# ── 首頁卡片：九日敬禮（聖堂裡的奉獻燭架：三層、九盞點亮的燭杯）────────
def section_novena():
    cx = 150
    b = frame_defs('#3B1A33', '#13070F', '#FFDFA0', (0.5, 0.56), 0.6)
    b += ('<linearGradient id="cup" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7E1420"/><stop offset=".45" stop-color="#D2423F"/><stop offset="1" stop-color="#6A0F1A"/></linearGradient>'
          '<radialGradient id="cflame" cx=".5" cy=".75" r=".8"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".35" stop-color="#FFF0A8"/><stop offset="1" stop-color="#FF9A2E"/></radialGradient>'
          '<radialGradient id="halo" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFE9A8" stop-opacity=".55"/><stop offset="1" stop-color="#FFE9A8" stop-opacity="0"/></radialGradient>'
          '<linearGradient id="wood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8A5A32"/><stop offset="1" stop-color="#4E2F17"/></linearGradient></defs>')
    b += frame_open()
    b += rays(cx, 210, 30, 40, 250, 3.2, '#FFEFC2', .1, alt=200)
    # 上方的小十字架
    b += f'<path d="M{pt(cx - 4, 46)}H{f(cx + 4)}V60H{f(cx + 15)}V68H{f(cx + 4)}V100H{f(cx - 4)}V68H{f(cx - 15)}V60H{f(cx - 4)}Z" fill="url(#gold)" stroke="#FFF0C4" stroke-width=".6"/>'
    # 三層燭架，後面的高；每層三盞紅玻璃燭杯
    rows = ((196, 0), (252, 1), (308, 0))
    for r, (y, shift) in enumerate(rows):
        b += f'<rect x="58" y="{y}" width="184" height="12" rx="2" fill="url(#wood)" stroke="#2E1A0C" stroke-width=".8"/>'
        for j in range(3):
            x = cx + (j - 1) * 58 + (shift * 0)
            b += f'<circle cx="{x}" cy="{y - 30}" r="26" fill="url(#halo)"/>'
            b += f'<path d="{flame(x, y - 30, 22, 5.4)}" fill="url(#cflame)"/>'
            b += f'<path d="M{pt(x - 15, y - 34)}H{f(x + 15)}L{pt(x + 12, y)}H{f(x - 12)}Z" fill="url(#cup)" stroke="#F2B38A" stroke-width=".8" opacity=".95"/>'
            b += f'<path d="M{pt(x - 15, y - 34)}H{f(x + 15)}" stroke="#FFD2B0" stroke-width="1.4" opacity=".8"/>'
            b += f'<path d="M{pt(x - 9, y - 28)}L{pt(x - 7, y - 4)}" stroke="#FFFFFF" stroke-width="2" opacity=".28" stroke-linecap="round"/>'
    # 燭架的兩根腳
    b += '<path d="M66,208V344M234,208V344" stroke="url(#wood)" stroke-width="7" stroke-linecap="round"/>'
    b += frame_close()
    write('section-novena.svg', b)


# ── 首頁卡片：修和聖事（交叉的天國鑰匙、紫色、上方的鴿子之光）────────
def key(color, edge):
    # 一把鑰匙，鑰匙齒朝上、柄朝下；以中點為 (0,0)，長 220
    g = f'<path d="M-5,-96H5V92H-5Z" fill="{color}" stroke="{edge}" stroke-width="1.4"/>'
    g += f'<path d="M5,-104H30V-92H22V-82H30V-62H22V-70H5Z" fill="{color}" stroke="{edge}" stroke-width="1.4" stroke-linejoin="round"/>'
    g += f'<path d="M-5,-104H5V-96H-5Z" fill="{color}"/>'
    g += f'<rect x="-11" y="56" width="22" height="7" rx="2" fill="{color}" stroke="{edge}" stroke-width="1.2"/>'
    g += f'<path d="M0,74C22,74 30,92 30,104C30,122 14,132 0,132C-14,132 -30,122 -30,104C-30,92 -22,74 0,74Z" fill="{color}" stroke="{edge}" stroke-width="1.6"/>'
    g += f'<path d="M0,90C10,90 14,98 14,104C14,112 8,118 0,118C-8,118 -14,112 -14,104C-14,98 -10,90 0,90Z" fill="#2A1640" stroke="{edge}" stroke-width="1.2"/>'
    return g


def section_confession():
    cx = 150
    b = frame_defs('#4A2468', '#170A24', '#FFE6B4', (0.5, 0.42), 0.6)
    b += ('<linearGradient id="silver" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".5" stop-color="#CFD3DA"/><stop offset="1" stop-color="#8C93A0"/></linearGradient>'
          '<radialGradient id="halo" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFF0C8" stop-opacity=".7"/><stop offset="1" stop-color="#FFF0C8" stop-opacity="0"/></radialGradient></defs>')
    b += frame_open()
    b += rays(cx, 120, 36, 26, 300, 3.6, '#FFF0C4', .14, alt=230)
    b += f'<circle cx="{cx}" cy="120" r="70" fill="url(#halo)"/>'
    b += f'<g transform="translate({cx} 120) scale(.62)">{dove()}</g>'
    b += f'<g transform="translate({cx} 262) rotate(-32) scale(.78)">{key("url(#silver)", "#5D6370")}</g>'
    b += f'<g transform="translate({cx} 262) rotate(32) scale(.78)">{key("url(#goldv)", "#6B4818")}</g>'
    b += frame_close()
    write('section-confession.svg', b)


for fn in (spirit, immaculate, auxilium, souls, section_bible, section_novena, section_confession):
    fn()
print('ok')
