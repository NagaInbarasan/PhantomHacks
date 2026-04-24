
$content = Get-Content -Path "e:/1/phantom-hacks (7)/phantom-hacks/css/style.css" -Raw
$openCount = ([regex]::Matches($content, '\{')).Count
$closeCount = ([regex]::Matches($content, '\}')).Count
Write-Host "Open: $openCount, Close: $closeCount"
