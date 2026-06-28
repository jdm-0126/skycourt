Add-Type -AssemblyName System.Drawing

# Logo
$img = [System.Drawing.Image]::FromFile('e:\skycourt\src\app\assets\sky court logo.png')
"=== Logo: Width=$($img.Width) Height=$($img.Height) ==="
$bmp = New-Object System.Drawing.Bitmap($img)
$colors = @{}
for ($x = 0; $x -lt $img.Width; $x += 8) {
    for ($y = 0; $y -lt $img.Height; $y += 8) {
        $p = $bmp.GetPixel($x, $y)
        if ($p.A -gt 128) {
            # Bucket into rough colors (round to nearest 16)
            $r = [Math]::Round($p.R / 16) * 16
            $g = [Math]::Round($p.G / 16) * 16
            $b = [Math]::Round($p.B / 16) * 16
            # Skip near-white
            if ($r -lt 230 -or $g -lt 230 -or $b -lt 230) {
                $hex = '#{0:X2}{1:X2}{2:X2}' -f $r, $g, $b
                if ($colors.ContainsKey($hex)) { $colors[$hex]++ } else { $colors[$hex] = 1 }
            }
        }
    }
}
$colors.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 20 | ForEach-Object { "$($_.Key): $($_.Value)" }
$bmp.Dispose()
$img.Dispose()

# Favicon
"=== Favicon ==="
$img2 = [System.Drawing.Image]::FromFile('e:\skycourt\src\app\assets\favicon.png')
"Width=$($img2.Width) Height=$($img2.Height)"
$bmp2 = New-Object System.Drawing.Bitmap($img2)
$colors2 = @{}
for ($x = 0; $x -lt $img2.Width; $x++) {
    for ($y = 0; $y -lt $img2.Height; $y++) {
        $p = $bmp2.GetPixel($x, $y)
        if ($p.A -gt 64) {
            $r = [Math]::Round($p.R / 16) * 16
            $g = [Math]::Round($p.G / 16) * 16
            $b = [Math]::Round($p.B / 16) * 16
            $hex = '#{0:X2}{1:X2}{2:X2}' -f $r, $g, $b
            if ($colors2.ContainsKey($hex)) { $colors2[$hex]++ } else { $colors2[$hex] = 1 }
        }
    }
}
$colors2.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 20 | ForEach-Object { "$($_.Key): $($_.Value)" }
$bmp2.Dispose()
$img2.Dispose()
