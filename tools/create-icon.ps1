Add-Type -AssemblyName System.Drawing

$assetDir = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\assets'))
$pngPath = Join-Path $assetDir 'buildflow.png'
$icoPath = Join-Path $assetDir 'buildflow.ico'
$bitmap = New-Object System.Drawing.Bitmap(256, 256)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::Transparent)

$rounded = New-Object System.Drawing.Drawing2D.GraphicsPath
$rounded.AddArc(12, 12, 120, 120, 180, 90)
$rounded.AddArc(124, 12, 120, 120, 270, 90)
$rounded.AddArc(124, 124, 120, 120, 0, 90)
$rounded.AddArc(12, 124, 120, 120, 90, 90)
$rounded.CloseFigure()
$start = [System.Drawing.ColorTranslator]::FromHtml('#6265f3')
$end = [System.Drawing.ColorTranslator]::FromHtml('#8649ef')
$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush((New-Object System.Drawing.Point(12, 12)), (New-Object System.Drawing.Point(244, 244)), $start, $end)
$graphics.FillPath($brush, $rounded)

$star = [System.Drawing.PointF[]]@(
  (New-Object System.Drawing.PointF(125, 47)), (New-Object System.Drawing.PointF(143, 105)),
  (New-Object System.Drawing.PointF(201, 123)), (New-Object System.Drawing.PointF(143, 141)),
  (New-Object System.Drawing.PointF(125, 199)), (New-Object System.Drawing.PointF(107, 141)),
  (New-Object System.Drawing.PointF(49, 123)), (New-Object System.Drawing.PointF(107, 105))
)
$smallStar = [System.Drawing.PointF[]]@(
  (New-Object System.Drawing.PointF(191, 53)), (New-Object System.Drawing.PointF(197, 70)),
  (New-Object System.Drawing.PointF(214, 76)), (New-Object System.Drawing.PointF(197, 82)),
  (New-Object System.Drawing.PointF(191, 99)), (New-Object System.Drawing.PointF(185, 82)),
  (New-Object System.Drawing.PointF(168, 76)), (New-Object System.Drawing.PointF(185, 70))
)
$graphics.FillPolygon([System.Drawing.Brushes]::White, $star)
$graphics.FillPolygon([System.Drawing.Brushes]::White, $smallStar)
$bitmap.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()
$brush.Dispose()
$rounded.Dispose()

$png = [IO.File]::ReadAllBytes($pngPath)
$stream = [IO.File]::Open($icoPath, [IO.FileMode]::Create)
$writer = New-Object IO.BinaryWriter($stream)
$writer.Write([uint16]0)
$writer.Write([uint16]1)
$writer.Write([uint16]1)
$writer.Write([byte]0)
$writer.Write([byte]0)
$writer.Write([byte]0)
$writer.Write([byte]0)
$writer.Write([uint16]1)
$writer.Write([uint16]32)
$writer.Write([uint32]$png.Length)
$writer.Write([uint32]22)
$writer.Write($png)
$writer.Dispose()
