# Records assets/demo.gif: run `vhs assets/demo.tape` from the repo root.
# Needs a font with octants as fallback (GNU Unifont 18 in ~/.local/share/fonts); the band
# needs ~10 free rows, hence the tall window. Then crop to the band and prompt:
#   ffmpeg -i assets/demo.gif -vf "crop=1300:400:0:600,split[a][b];[a]palettegen=max_colors=64[p];[b][p]paletteuse=dither=none" out.gif
Output assets/demo.gif

Set Shell "bash"
Set FontFamily "JetBrainsMono Nerd Font, Unifont Upper"
Set FontSize 14
Set Width 1300
Set Height 1000
Set Padding 16
Set Theme "Catppuccin Mocha"
Set TypingSpeed 45ms

Hide
Type `mkdir -p /tmp/jungle-demo && cd /tmp/jungle-demo && clear && env -i HOME="$HOME" PATH="$PATH" TERM=xterm-256color COLORTERM=truecolor LANG=C.UTF-8 claude --model sonnet` Enter
Sleep 5s
# First run in a new folder asks to trust it: take "Yes".
Down
Enter
Sleep 8s
Show

Type "/jungle demo"
Sleep 400ms
Enter
Sleep 60s
