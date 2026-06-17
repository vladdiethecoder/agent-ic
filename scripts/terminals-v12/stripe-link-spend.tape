Set Shell "bash"
Set Theme {"background":"#0b0d10","foreground":"#c9d1d9","cursor":"#76b900","black":"#0b0d10","red":"#f85149","green":"#76b900","yellow":"#ffbd2e","blue":"#58a6ff","magenta":"#a371f7","cyan":"#39c5cf","white":"#c9d1d9","brightBlack":"#6e7681","brightRed":"#ff7b72","brightGreen":"#56d364","brightYellow":"#f2cc60","brightBlue":"#79c0ff","brightMagenta":"#d2a8ff","brightCyan":"#56d4dd","brightWhite":"#ffffff"}
Set FontSize 18
Set Width 1920
Set Height 1080
Set Padding 24
Set Margin 24
Set MarginFill "#0b0d10"
Set WindowBar Colorful
Set TypingSpeed 50ms

Type "echo '[LIVE] Stripe Link spend request'"
Enter
Sleep 200ms
Type "link-cli auth login"
Enter
Sleep 3s
Type "link-cli spend-request create --amount 35000 --currency usd --reason 'Atlas Freight autonomous RMA pilot' --project atlas-freight"
Enter
Sleep 5s
