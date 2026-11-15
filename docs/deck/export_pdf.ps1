# Exports the Round 2 deck to PDF with PowerPoint, so the PDF matches what PowerPoint shows.
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$pptx = Join-Path $here 'BrandGuard AI - Round 2 Build.pptx'
$pdf = Join-Path $here 'BrandGuard AI - Round 2 Build.pdf'
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
