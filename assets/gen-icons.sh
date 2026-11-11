#!/usr/bin/env bash
# 生成 icon.png（1024 见方）与 social-preview.png（1280×640）。用 ImageMagick 直接画，不经 SVG。
# 视觉规范同两张信息图（kami）：羊皮纸底、象牙色卡片、墨蓝一个强调色、暖灰、Charter 衬线字、细线。
# 字体路径是 Debian 系的 Bitstream Charter；别的系统用 CHARTER 与 CHARTER_ITALIC 两个环境变量覆盖。
set -euo pipefail
cd "$(dirname "$0")"
C="${CHARTER:-/usr/share/fonts/X11/Type1/c0648bt_.pfb}"
CI="${CHARTER_ITALIC:-/usr/share/fonts/X11/Type1/c0649bt_.pfb}"

convert -size 1024x1024 xc:'#f5f4ed' \
  -fill '#faf9f5' -stroke '#d8d5c8' -strokewidth 3 -draw "roundrectangle 96,96 928,928 24,24" \
  -fill none -stroke '#1B365D' -strokewidth 12 -draw "stroke-linecap round arc 212,212 812,812 -50,250" \
  -draw "stroke-linecap round stroke-linejoin round fill none polyline 765,296 705,282 723,341" \
  -stroke none -fill '#1B365D' -font "$C" -pointsize 250 -gravity center -annotate +0-14 'pqw' \
  -strip -depth 8 icon.png

convert -size 1280x640 xc:'#f5f4ed' \
  -fill '#faf9f5' -stroke '#d8d5c8' -strokewidth 1 -draw "roundrectangle 48,48 1232,592 6,6" \
  -stroke none -fill '#6b6a64' -font "$C" -pointsize 22 -kerning 4 -gravity northwest -annotate +104+112 'AGENT SKILLS  ·  CLAUDE CODE  ·  CODEX  ·  CURSOR' -kerning 0 \
  -fill '#1B365D' -font "$C" -pointsize 100 -annotate +100+160 'pqw-skills' \
  -fill '#141413' -font "$C" -pointsize 46 -annotate +104+300 'Hand a long run to your agent, and trust it.' \
  -fill none -stroke '#d8d5c8' -strokewidth 1 -draw "line 104,392 1176,392" \
  -stroke none -fill '#504e49' -font "$CI" -pointsize 30 -annotate +104+424 'Define with you   ›   hand off one run   ›   deliver in slices   ›   you verify' \
  -fill '#6b6a64' -font "$C" -pointsize 24 -annotate +104+500 '25 skills  ·  13 steps  ·  six thinking models  ·  one candid friend' \
  -gravity none -fill none -stroke '#1B365D' -strokewidth 3 -draw "stroke-linecap round arc 1040,104 1176,240 -50,250" \
  -draw "stroke-linecap round stroke-linejoin round fill none polyline 1166,123 1152,120 1156,134" \
  -stroke none -fill '#1B365D' -font "$C" -pointsize 44 -draw "text 1068,186 'pqw'" \
  -strip -depth 8 social-preview.png
