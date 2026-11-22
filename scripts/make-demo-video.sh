#!/usr/bin/env bash
# Stitch the two recordings from tests/demo-video.spec.ts (tutor laptop on the
# left, Maya's phone on the right) into docs/demo/tutorpulse-demo.mp4,
# trimmed to the scripted scenes. Needs ffmpeg.
set -euo pipefail
RAW=test-results/demo-raw
OUT=docs/demo/tutorpulse-demo.mp4
mkdir -p docs/demo

tutor=$(ls -t "$RAW"/tutor/*.webm | head -1)
maya=$(ls -t "$RAW"/maya/*.webm | head -1)
start=$(python3 -c "import json;print(json.load(open('$RAW/timing.json'))['startSeconds'])")
dur=$(python3 -c "import json;print(json.load(open('$RAW/timing.json'))['durationSeconds'])")

# Both contexts were created together, so one start offset trims both.
ffmpeg -y -loglevel error \
  -ss "$start" -t "$dur" -i "$tutor" \
  -ss "$start" -t "$dur" -i "$maya" \
  -filter_complex "\
    [0:v]scale=1280:800,setsar=1[t];\
    [1:v]scale=-2:760,setsar=1,pad=iw+40:800:20:20:color=0xF6F1E7[p];\
    [t][p]hstack=inputs=2,pad=iw:ih:0:0:color=0xF6F1E7,format=yuv420p[v]" \
  -map "[v]" -r 30 -c:v libx264 -preset slow -crf 20 -movflags +faststart "$OUT"

echo "wrote $OUT ($(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT" | cut -d. -f1)s)"
