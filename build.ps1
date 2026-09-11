$ErrorActionPreference = "Stop"

$SourceDir = Join-Path $PSScriptRoot "src"
$SourceFile = Join-Path $SourceDir "index.html"
$OutputFile = Join-Path $PSScriptRoot "index.html"

$html = Get-Content $SourceFile -Raw -Encoding UTF8

$css = Get-Content (Join-Path $SourceDir "styles.css") -Raw -Encoding UTF8
$mapping = Get-Content (Join-Path $SourceDir "mapping.js") -Raw -Encoding UTF8
$script = Get-Content (Join-Path $SourceDir "script.js") -Raw -Encoding UTF8

# Inline styles.css
$html = [regex]::Replace(
    $html,
    '<link\s+rel=["'']stylesheet["'']\s+href=["'']styles\.css["'']\s*/?>',
    [System.Text.RegularExpressions.MatchEvaluator]{
        param($match)
        "<style>`n$css`n</style>"
    }
)

# Inline mapping.js
$html = [regex]::Replace(
    $html,
    '<script\s+src=["'']mapping\.js["'']\s*></script>',
    [System.Text.RegularExpressions.MatchEvaluator]{
        param($match)
        "<script>`n$mapping`n</script>"
    }
)

# Inline script.js
$html = [regex]::Replace(
    $html,
    '<script\s+src=["'']script\.js["'']\s*></script>',
    [System.Text.RegularExpressions.MatchEvaluator]{
        param($match)
        "<script defer>`n$script`n</script>"
    }
)

# Write UTF-8 without BOM
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText($OutputFile, $html, $utf8NoBom)

Write-Host "Built: $OutputFile"
