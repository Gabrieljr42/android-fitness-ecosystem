# Exporta o símbolo vetorial do redesign para todos os tamanhos de instalação.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$brandRoot = Split-Path -Parent $PSScriptRoot
$brandRes = Join-Path $brandRoot 'app/src/main/res'
$brandAssets = Join-Path $brandRoot 'app/src/main/assets'
$brandVector = [IO.File]::ReadAllText((Join-Path $brandRes 'drawable/brand_mark.xml'))
[IO.File]::WriteAllText((Join-Path $brandRes 'drawable/launch_mark.xml'), $brandVector.Replace('108dp','432dp'))
# Alias preserva referências antigas, sem manter outro desenho.
[IO.File]::WriteAllText((Join-Path $brandRes 'drawable/ic_launcher_logo.xml'), '<layer-list xmlns:android="http://schemas.android.com/apk/res/android"><item android:drawable="@color/brand_background"/><item android:drawable="@drawable/brand_mark"/></layer-list>')
$brandTargets = @{
    'mipmap-mdpi/ic_launcher.png' = 48
    'mipmap-hdpi/ic_launcher.png' = 72
    'mipmap-xhdpi/ic_launcher.png' = 96
    'mipmap-xxhdpi/ic_launcher.png' = 144
    'mipmap-xxxhdpi/ic_launcher.png' = 192
}
function Export-BrandPng([string]$brandPath, [int]$brandSize) {
    $brandBitmap = [Drawing.Bitmap]::new($brandSize, $brandSize)
    $brandGraphics = [Drawing.Graphics]::FromImage($brandBitmap)
    $brandPen = [Drawing.Pen]::new([Drawing.ColorTranslator]::FromHtml('#C6E59D'), [single]($brandSize * 2.2 / 36))
    try {
        $brandGraphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $brandGraphics.Clear([Drawing.ColorTranslator]::FromHtml('#101510'))
        $brandPen.StartCap = [Drawing.Drawing2D.LineCap]::Round
        $brandPen.EndCap = [Drawing.Drawing2D.LineCap]::Round
        foreach ($brandArc in @(@(9,270), @(5.5,300), @(2,270))) {
            $brandRadius = [single]($brandArc[0] * $brandSize / 36)
            $brandInset = [single]($brandSize / 2 - $brandRadius)
            $brandGraphics.DrawArc($brandPen, $brandInset, $brandInset, [single](2*$brandRadius), [single](2*$brandRadius), [single]-90, [single]$brandArc[1])
        }
        $brandBitmap.Save($brandPath, [Drawing.Imaging.ImageFormat]::Png)
    } finally { $brandPen.Dispose(); $brandGraphics.Dispose(); $brandBitmap.Dispose() }
}
foreach ($brandTarget in $brandTargets.GetEnumerator()) { Export-BrandPng (Join-Path $brandRes $brandTarget.Key) $brandTarget.Value }
Export-BrandPng (Join-Path $brandAssets 'icon-192.png') 192
Export-BrandPng (Join-Path $brandAssets 'icon-512.png') 512
Export-BrandPng (Join-Path $brandAssets 'apps/nutricao/icon-192.png') 192
Write-Output 'Ícones Android e web atualizados.'
