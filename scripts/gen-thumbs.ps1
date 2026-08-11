# 生成相册缩略图：public/album/thumbs/ 下生成最长边 900px 的 JPEG（质量 80）
# 相册网格展示用缩略图，点击预览仍加载原图，大幅降低翻页卡顿
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$srcDir = Join-Path $PSScriptRoot '..\public\album'
$thumbDir = Join-Path $srcDir 'thumbs'
New-Item -ItemType Directory -Force -Path $thumbDir | Out-Null

$exts = @('.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp')
$maxSide = 900
$quality = 80L
$count = 0

Get-ChildItem -LiteralPath $srcDir -File |
  Where-Object { $exts -contains $_.Extension.ToLower() } |
  ForEach-Object {
    $base = [System.IO.Path]::GetFileNameWithoutExtension($_.Name)
    $out = Join-Path $thumbDir ($base + '.jpg')
    if ((Test-Path -LiteralPath $out) -and ((Get-Item -LiteralPath $out).LastWriteTimeUtc -ge $_.LastWriteTimeUtc)) {
      return
    }
    try {
      $img = [System.Drawing.Image]::FromFile($_.FullName)
      try {
        $w = $img.Width
        $h = $img.Height
        if ($w -le $maxSide -and $h -le $maxSide) {
          $nw = $w
          $nh = $h
        } else {
          $ratio = [Math]::Min($maxSide / $w, $maxSide / $h)
          $nw = [int][Math]::Round($w * $ratio)
          $nh = [int][Math]::Round($h * $ratio)
        }
        $bmp = New-Object System.Drawing.Bitmap($nw, $nh)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.DrawImage($img, 0, 0, $nw, $nh)
        $g.Dispose()

        $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
          Where-Object { $_.MimeType -eq 'image/jpeg' }
        $ep = New-Object System.Drawing.Imaging.EncoderParameters(1)
        $ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter(
          [System.Drawing.Imaging.Encoder]::Quality, $quality)
        $bmp.Save($out, $codec, $ep)
        $bmp.Dispose()
        $count++
        Write-Output ("thumb: " + $_.Name + " -> " + $nw + "x" + $nh)
      } finally {
        $img.Dispose()
      }
    } catch {
      Write-Warning ("跳过 " + $_.Name + ": " + $_.Exception.Message)
    }
  }

Write-Output ("生成完成，共 " + $count + " 张缩略图")
