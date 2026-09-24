# generate_icons.ps1 - Zero-dependency Android Notification Icon Generator for Windows
Add-Type -AssemblyName System.Drawing

$scriptDir = $PSScriptRoot
if (-not $scriptDir) { $scriptDir = (Get-Location).Path }

# Locate source image
$sourcePath = Join-Path $scriptDir "assets\notification_silhouette.png"
if (-not (Test-Path $sourcePath)) {
    $sourcePath = Join-Path $scriptDir "android\assets\notification_silhouette.png"
}

if (-not (Test-Path $sourcePath)) {
    Write-Error "Could not find assets\notification_silhouette.png in $scriptDir"
    exit 1
}

# Locate Android res directory
$resDir = Join-Path $scriptDir "android\app\src\main\res"
if (-not (Test-Path $resDir)) {
    $resDir = Join-Path $scriptDir "android\android\app\src\main\res"
}

if (-not (Test-Path $resDir)) {
    Write-Error "Could not find Android res directory in $scriptDir"
    exit 1
}

Write-Host "Source Image: $sourcePath" -ForegroundColor Cyan
Write-Host "Target Res:   $resDir" -ForegroundColor Cyan

# Load source image into memory
$fileBytes = [System.IO.File]::ReadAllBytes($sourcePath)
$ms = New-Object System.IO.MemoryStream(,$fileBytes)
$srcBitmap = [System.Drawing.Bitmap]::FromStream($ms)

function Resize-Image($source, [int]$targetWidth, [int]$targetHeight, [string]$outPath) {
    $target = New-Object System.Drawing.Bitmap $targetWidth, $targetHeight, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($target)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.DrawImage($source, 0, 0, $targetWidth, $targetHeight)
    $g.Dispose()
    $target.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $target.Dispose()
}

function Create-LargeBadge($source, [int]$targetSize, [string]$outPath) {
    $target = New-Object System.Drawing.Bitmap $targetSize, $targetSize, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($target)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)
    
    # Draw blue circular background (#2563EB)
    $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 37, 99, 235))
    $g.FillEllipse($brush, 1, 1, $targetSize - 2, $targetSize - 2)
    $brush.Dispose()
    
    # Scale and center the white silhouette inside the circle
    $innerPadding = [int]($targetSize * 0.15)
    $innerSize = $targetSize - ($innerPadding * 2)
    $g.DrawImage($source, $innerPadding, $innerPadding, $innerSize, $innerSize)
    $g.Dispose()
    $target.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $target.Dispose()
}

$densities = @(
    @{ Folder = "drawable"; Size = 48; LargeSize = 192 },
    @{ Folder = "drawable-mdpi"; Size = 24; LargeSize = 64 },
    @{ Folder = "drawable-hdpi"; Size = 36; LargeSize = 96 },
    @{ Folder = "drawable-xhdpi"; Size = 48; LargeSize = 128 },
    @{ Folder = "drawable-xxhdpi"; Size = 72; LargeSize = 192 },
    @{ Folder = "drawable-xxxhdpi"; Size = 96; LargeSize = 256 }
)

foreach ($d in $densities) {
    $targetFolder = Join-Path $resDir $d.Folder
    if (-not (Test-Path $targetFolder)) {
        New-Item -ItemType Directory -Path $targetFolder -Force | Out-Null
    }

    # Small silhouette icons for Android status bar and notification header
    $icNotif = Join-Path $targetFolder "ic_notification.png"
    $resApp = Join-Path $targetFolder "res_app_icon.png"
    Resize-Image $srcBitmap $d.Size $d.Size $icNotif
    Resize-Image $srcBitmap $d.Size $d.Size $resApp
    Write-Host "  -> Generated small icons in $($d.Folder) ($($d.Size)x$($d.Size))" -ForegroundColor Green

    # Large badge icon for notification card body
    $resLarge = Join-Path $targetFolder "res_large_icon.png"
    Create-LargeBadge $srcBitmap $d.LargeSize $resLarge
    Write-Host "  -> Generated large badge in $($d.Folder) ($($d.LargeSize)x$($d.LargeSize))" -ForegroundColor Green
}

$srcBitmap.Dispose()
$ms.Dispose()

Write-Host ""
Write-Host "SUCCESS: All notification icons generated successfully!" -ForegroundColor Yellow
