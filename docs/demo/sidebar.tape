# EVP pointer-v0.19.0-1. Run inside the isolated hunk-history checkout.
Output ../sidebar.gif
Set Shell env BASH_SILENCE_DEPRECATION_WARNING=1 /bin/bash --noprofile --norc
Set Theme { "background": "#1d2021", "foreground": "#ebdbb2" }
Set Cols 110
Set Rows 30
Set FontSize 18
Set Padding 18
Set Framerate 50
Set TypingSpeed 45ms
Env PS1 "$ "
Sleep 500ms
Type "hunk show d3ac317 --mode stack"
Enter
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
MouseMove@400ms@Linear 30 1 48 12
Sleep 1s
