ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 recording.webm 

ffmpeg -i recording.webm \
-map 0:v:0 -map 0:v:0 -map 0:v:0 -map 0:a:0 \
-c:v libaom-av1 -crf 22 -b:v 0 -cpu-used 6 \
-filter:v:0 "fps=24,scale=-2:'min(1080,ih)'" -force_key_frames:v:0 "expr:gte(t,n_forced*4)" \
-filter:v:1 "fps=24,scale=-2:'min(720,ih)'"  -force_key_frames:v:1 "expr:gte(t,n_forced*4)" \
-filter:v:2 "fps=24,scale=-2:'min(480,ih)'"  -force_key_frames:v:2 "expr:gte(t,n_forced*4)" \
-c:a libopus -b:a 96k \
-f dash \
-seg_duration 4 \
-use_template 1 \
-use_timeline 1 \
-init_seg_name 'init-stream$RepresentationID$.webm' \
-media_seg_name 'chunk-stream$RepresentationID$-$Number%05d$.webm' \
-adaptation_sets "id=0,streams=v id=1,streams=a" \
dash-output/manifest.mpd
