# Exports a deck to PDF with PowerPoint, so the PDF matches what PowerPoint shows.
# Usage: export_pdf.ps1 ["BrandGuard AI - Round 3 Final Product"]   (default: the Round 2 deck)
param([string]$Name = 'BrandGuard AI - Round 2 Build')
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$pptx = Join-Path $here "$Name.pptx"
$pdf = Join-Path $here "$Name.pdf"
$app = New-Object -ComObject PowerPoint.Application
try {
    $deck = $app.Presentations.Open($pptx, $true, $false, $false)  # read-only, no window
    $deck.SaveAs($pdf, 32)  # 32 = ppSaveAsPDF
    $deck.Close()
    Write-Output "saved $pdf"
} finally {
    $app.Quit()
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($app)
}
