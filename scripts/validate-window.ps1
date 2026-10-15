param([Parameter(Mandatory = $true)][long]$WindowHandle)
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class JarvisWindowProbe {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT point);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hwnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll", EntryPoint="GetWindowLongW")] public static extern int GetWindowLong(IntPtr hwnd, int index);
}
'@
$handle = [IntPtr]::new($WindowHandle)
$before = New-Object JarvisWindowProbe+RECT
$after = New-Object JarvisWindowProbe+RECT
$cursor = New-Object JarvisWindowProbe+POINT
if (-not [JarvisWindowProbe]::GetWindowRect($handle, [ref]$before)) { throw 'Cannot locate test window' }
[void][JarvisWindowProbe]::GetCursorPos([ref]$cursor)
try {
  [void][JarvisWindowProbe]::SetForegroundWindow($handle)
  Start-Sleep -Milliseconds 400
  [void][JarvisWindowProbe]::SetCursorPos(($before.Left + 200), ($before.Top + 35))
  [JarvisWindowProbe]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 150
  for ($step = 1; $step -le 8; $step++) {
    [void][JarvisWindowProbe]::SetCursorPos(($before.Left + 200 + $step * 8), ($before.Top + 35 + $step * 4))
    Start-Sleep -Milliseconds 40
  }
  [JarvisWindowProbe]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 300
  [void][JarvisWindowProbe]::GetWindowRect($handle, [ref]$after)
  if ([Math]::Abs($after.Left - $before.Left) -lt 10 -and [Math]::Abs($after.Top - $before.Top) -lt 10) {
    throw 'Dragging the HUD header did not move its native window'
  }
  $style = [JarvisWindowProbe]::GetWindowLong($handle, -16)
  $extendedStyle = [JarvisWindowProbe]::GetWindowLong($handle, -20)
  if (($style -band 0x00C00000) -eq 0x00C00000) { throw 'Unexpected native caption on frameless window' }
  if (($extendedStyle -band 0x00280000) -eq 0) { throw "No layered or DirectComposition window style found: $extendedStyle" }
  Write-Output 'Native drag, frameless style and composition window style verified'
} finally {
  [JarvisWindowProbe]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
  [void][JarvisWindowProbe]::SetCursorPos($cursor.X, $cursor.Y)
  [void][JarvisWindowProbe]::SetWindowPos($handle, [IntPtr]::Zero, $before.Left, $before.Top, 0, 0, 0x0015)
}
