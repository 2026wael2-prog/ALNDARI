<#
.SYNOPSIS
  Installs the AlNadary Branch B1 Local Edge Server as a background Windows Task
  that starts automatically on system boot, restarts on failure, restricts port 8787
  to the Private LAN firewall profile, and adds a Desktop shortcut.
#>
param(
  [string]$BranchCode = "B1",
  [int]$Port = 8787
)

$ErrorActionPreference = "Stop"
$EdgeRoot = Split-Path -Parent $PSScriptRoot
$ServerScript = Join-Path $EdgeRoot "src\server.mjs"
$EnvFile = Join-Path $EdgeRoot ".env.edge"
$NodeExe = (Get-Command node -ErrorAction Stop).Source
$TaskName = "AlNadaryEdge$BranchCode"

if (-not (Test-Path $EnvFile)) {
  Write-Warning "ملف الإعدادات $EnvFile غير موجود — يرجى نسخه من .env.edge.example وتعبئة مفاتيح Supabase أولاً."
}

$LauncherCmd = Join-Path $EdgeRoot "start-edge-$BranchCode.cmd"
@"
@echo off
cd /d "$EdgeRoot"
"$NodeExe" "$ServerScript" >> "$EdgeRoot\edge-$BranchCode.log" 2>&1
"@ | Set-Content -Path $LauncherCmd -Encoding ASCII

$Action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$LauncherCmd`"" -WorkingDirectory $EdgeRoot
$Trigger = New-ScheduledTaskTrigger -AtStartup
$Settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -RestartCount 5 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero)

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $Action `
  -Trigger $Trigger `
  -Settings $Settings `
  -Description "AlNadary ERP Branch $BranchCode Local Failover Mirror & Google Drive Backup Server" `
  -Force | Out-Null

# Open TCP port ONLY for Private LAN profile (never Public internet)
$RuleName = "AlNadary-Edge-$BranchCode-LAN"
if (-not (Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue)) {
  try {
    New-NetFirewallRule `
      -DisplayName $RuleName `
      -Direction Inbound `
      -Protocol TCP `
      -LocalPort $Port `
      -Profile Private `
      -Action Allow | Out-Null
  } catch {
    Write-Warning "تعذر إضافة قاعدة الجدار الناري تلقائياً (تحتاج صلاحيات المسؤول): $_"
  }
}

# Create Desktop URL shortcut pointing to the local LAN gateway
$DesktopPath = [Environment]::GetFolderPath("Desktop")
$ShortcutFile = Join-Path $DesktopPath "النظاري ERP - فرع وائل ($BranchCode).url"
@"
[InternetShortcut]
URL=http://127.0.0.1:$Port/
"@ | Set-Content -Path $ShortcutFile -Encoding UTF8

Start-ScheduledTask -TaskName $TaskName
Write-Host "✅ تم تثبيت وتشغيل خادم فرع $BranchCode ($TaskName) على المنفذ $Port بنجاح." -ForegroundColor Green
