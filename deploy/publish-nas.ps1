<#
.SYNOPSIS
  MeePick 웹을 PC에서 빌드해 NAS로 밀어 넣는다.

.DESCRIPTION
  NAS(DS218+ 급)는 빌드를 돌리기엔 느리고 RAM도 부족하다. 빌드는 PC에서 하고
  NAS는 nginx로 정적 파일만 서빙한다. NAS에 node도 git도 필요 없다.

  -Target 을 주면 dist/ + nginx.conf + docker-compose.yml 을 그 폴더로 복사한다.
  dist 는 미러링(robocopy /MIR)이라 예전 해시 번들이 쌓이지 않는다.
  대상 폴더의 dist 하위만 미러링하며, 대상 폴더 자체의 다른 파일은 건드리지 않는다.

.EXAMPLE
  .\deploy\publish-nas.ps1
  빌드만 한다. dist/ 를 File Station으로 직접 올릴 때.

.EXAMPLE
  .\deploy\publish-nas.ps1 -Target \\MyNAS\docker\meepick
  빌드하고 NAS 공유 폴더로 복사까지 한다.
#>
[CmdletBinding()]
param(
    # NAS의 배포 폴더. SMB 경로(\\NAS\docker\meepick) 또는 마운트된 드라이브 경로.
    [string] $Target,

    # 이미 빌드한 dist/ 를 그대로 올리고 싶을 때.
    [switch] $SkipBuild
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$distPath = Join-Path $root 'dist'

# ── 1. .env 확인 ───────────────────────────────────────────────────────────
# EXPO_PUBLIC_ 값은 빌드 시점에 번들에 박힌다. 비어 있으면 앱이 설정 안내 화면만 띄운다.
$envPath = Join-Path $root '.env'
if (-not (Test-Path $envPath)) {
    throw ".env가 없습니다 ($envPath). .env.example을 참고해 공개 값 2개를 채워 주세요."
}

$envValues = @{}
foreach ($key in @('EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY')) {
    $line = Get-Content $envPath | Where-Object { $_ -match "^\s*$key\s*=" } | Select-Object -First 1
    if (-not $line) { throw ".env에 $key 줄이 없습니다." }
    $value = ($line -split '=', 2)[1].Trim()
    if (-not $value) { throw ".env의 $key 가 비어 있습니다. 값이 없으면 앱이 Supabase에 연결하지 못합니다." }
    $envValues[$key] = $value
}

<#
  빌드 결과에 .env 값이 실제로 박혔는지 확인한다.

  Metro는 바벨 변환 결과를 캐시하는데, EXPO_PUBLIC_ 치환도 그 변환의 일부다.
  .env 없이(또는 옛 값으로) 한 번 빌드했으면 캐시에 undefined가 박힌 채 남아,
  .env를 고쳐도 조용히 예전 결과가 나온다. 그대로 배포하면 태블릿에서
  "설정 안내" 화면만 뜬다. 그래서 눈으로 확인하지 말고 여기서 검사한다.
#>
function Test-EnvInlined {
    param([string] $DistPath, [string[]] $Values)

    $webDir = Join-Path $DistPath '_expo\static\js\web'
    if (-not (Test-Path $webDir)) { return $false }

    $bundles = Get-ChildItem $webDir -Filter *.js -File
    if (-not $bundles) { return $false }

    $text = ($bundles | ForEach-Object { [System.IO.File]::ReadAllText($_.FullName) }) -join "`n"
    foreach ($v in $Values) {
        if (-not $text.Contains($v)) { return $false }
    }
    return $true
}

# ── 2. 빌드 ────────────────────────────────────────────────────────────────
if ($SkipBuild) {
    if (-not (Test-Path $distPath)) { throw "-SkipBuild를 줬는데 dist/ 가 없습니다." }
    Write-Host "빌드 건너뜀 — 기존 dist/ 사용" -ForegroundColor Yellow
}
else {
    # 이전 빌드의 잔재가 섞이지 않도록 비우고 시작한다.
    if (Test-Path $distPath) { Remove-Item $distPath -Recurse -Force }

    Write-Host "웹 빌드 중..." -ForegroundColor Cyan
    Push-Location $root
    try {
        & npx expo export --platform web
        if ($LASTEXITCODE -ne 0) { throw "expo export 실패 (exit $LASTEXITCODE)" }

        if (-not (Test-EnvInlined $distPath $envValues.Values)) {
            Write-Host "번들에 .env 값이 없습니다 — Metro 캐시가 오래됐습니다. --clear로 재빌드합니다." -ForegroundColor Yellow
            Remove-Item $distPath -Recurse -Force

            & npx expo export --platform web --clear
            if ($LASTEXITCODE -ne 0) { throw "expo export --clear 실패 (exit $LASTEXITCODE)" }

            if (-not (Test-EnvInlined $distPath $envValues.Values)) {
                throw "재빌드 후에도 번들에 .env 값이 없습니다. .env 인코딩(BOM 없는 UTF-8)과 EXPO_PUBLIC_ 접두사를 확인하세요."
            }
        }
    }
    finally {
        Pop-Location
    }
}

$distSize = (Get-ChildItem $distPath -Recurse -File | Measure-Object Length -Sum).Sum
Write-Host ("빌드 완료 — dist/ {0:N1} MB (Supabase 설정 반영 확인됨)" -f ($distSize / 1MB)) -ForegroundColor Green

# ── 3. NAS로 복사 ──────────────────────────────────────────────────────────
if (-not $Target) {
    Write-Host ""
    Write-Host "dist/ 를 NAS 배포 폴더에 올린 뒤 컨테이너를 재시작하세요."
    Write-Host "(-Target \\NAS\docker\meepick 을 주면 복사까지 자동으로 합니다)"
    return
}

if (-not (Test-Path $Target)) {
    Write-Host "대상 폴더 생성: $Target"
    New-Item -ItemType Directory -Path $Target -Force | Out-Null
}

$targetDist = Join-Path $Target 'dist'
Write-Host "복사 중 → $targetDist" -ForegroundColor Cyan

robocopy $distPath $targetDist /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
# robocopy는 0~7이 정상(0=변경없음, 1=복사됨, 3=복사+삭제…), 8 이상이 실패다.
if ($LASTEXITCODE -ge 8) { throw "robocopy 실패 (exit $LASTEXITCODE)" }

Copy-Item (Join-Path $PSScriptRoot 'nginx.conf') $Target -Force
Copy-Item (Join-Path $PSScriptRoot 'nas\docker-compose.yml') $Target -Force

# 백업 스크립트 — CRLF가 섞이면 NAS의 sh가 해석하지 못하므로 LF로 강제해서 쓴다.
$backupText = ([System.IO.File]::ReadAllText((Join-Path $PSScriptRoot 'backup-supabase.sh'))) -replace "`r`n", "`n"
[System.IO.File]::WriteAllText((Join-Path $Target 'backup-supabase.sh'), $backupText, (New-Object System.Text.UTF8Encoding($false)))

# 백업 설정 — PC의 .env 값으로 만든다 (anon 키는 어차피 번들에 드는 공개 값이다).
$backupEnv = "SUPABASE_URL=$($envValues['EXPO_PUBLIC_SUPABASE_URL'])`nSUPABASE_ANON_KEY=$($envValues['EXPO_PUBLIC_SUPABASE_ANON_KEY'])`n"
[System.IO.File]::WriteAllText((Join-Path $Target 'backup.env'), $backupEnv, (New-Object System.Text.UTF8Encoding($false)))

Write-Host ""
Write-Host "완료. $Target 에 dist/ · nginx.conf · docker-compose.yml · backup-supabase.sh 가 올라갔습니다." -ForegroundColor Green
Write-Host "첫 배포라면 deploy/README.md의 '서빙 시작' 절차를 따르세요."
Write-Host "이미 돌고 있다면 태블릿에서 새로고침만 하면 반영됩니다 (컨테이너 재시작 불필요)."

# robocopy의 정상 종료 코드(1~7)가 스크립트의 종료 코드로 새어 나가 실패처럼 보이지 않게 한다.
exit 0
