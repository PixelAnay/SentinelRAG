# Crops the README screenshots out of the headless-Chrome shots in runs/shots/ into docs/screens/.
# Run `node scripts/ui_check.mjs 1440 900` and `node scripts/ui_flow.mjs` first.
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot -Parent
$out = Join-Path $root "docs\screens"
New-Item -ItemType Directory -Force $out | Out-Null

function Crop($name, $dest, $height) {
  $src = [System.Drawing.Image]::FromFile((Join-Path $root "runs\shots\$name"))
  $h = [Math]::Min($height, $src.Height)
  $bmp = New-Object System.Drawing.Bitmap $src.Width, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.DrawImage($src, (New-Object System.Drawing.Rectangle 0, 0, $src.Width, $h), (New-Object System.Drawing.Rectangle 0, 0, $src.Width, $h), [System.Drawing.GraphicsUnit]::Pixel)
  $bmp.Save((Join-Path $out $dest), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose(); $src.Dispose()
  "$dest $($src.Width)x$h"
}

Crop "overview-1440.png"      "overview.png" 1130
Crop "flow-mailbox-1440.png"  "mailbox.png"  900
Crop "flow-case-1440.png"     "cases.png"    1384
Crop "results-1440.png"       "results.png"  1500
