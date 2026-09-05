# EVP pointer-v0.19.0-1. Run inside the isolated hunk-history checkout.
Output ../sidebar.gif
Set Shell hunk show d3ac317 --mode stack
Set Theme { "background": "#1d2021", "foreground": "#ebdbb2" }
Set Cols 110
Set Rows 30
Set FontSize 18
Set Padding 18
Set Framerate 50
Wait+Screen@15s /All 37 loaded/
Sleep 2s
Screenshot ../history.png
MouseMove@400ms@Linear 48 12 14 1
Sleep 500ms
Click@120ms 14 1
Sleep 800ms
MouseMove@350ms@Linear 14 1 15 7
Sleep 300ms
Click@120ms 15 7
Sleep 1s
MouseMove@350ms@Linear 15 7 100 6
Sleep 400ms
Screenshot ../files.png
MouseMove@400ms@Linear 100 6 30 1
Sleep 500ms
Click@120ms 30 1
Sleep 1s
# Double-click the tabbed-sidebar commit to arm an inclusive range.
MouseMove@500ms@Linear 30 1 12 27
Sleep 400ms
Click@60ms 12 27
Sleep 80ms
Click@60ms 12 27
Wait+Screen@10s /End · Esc/
Sleep 1200ms
Screenshot ../range-start.png
# Select the earlier endpoint; the three selected rows become one net diff.
MouseMove@400ms@Linear 12 27 12 25
Sleep 450ms
Click@100ms 12 25
Wait+Screen@10s /Applied 33–35/
Sleep 2s
MouseMove@400ms@Linear 12 25 100 6
Sleep 800ms
Screenshot ../range.png
Sleep 2s
