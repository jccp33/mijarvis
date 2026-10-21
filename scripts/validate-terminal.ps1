param([switch]$ListOnly, [string]$Exclude = '')
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public class JarvisTerminalProbe {
  public delegate bool Callback(IntPtr window, IntPtr param);
  [DllImport("user32.dll")] public static extern bool EnumWindows(Callback callback, IntPtr param);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr window, StringBuilder text, int count);
  public static long[] Windows() {
    var windows = new List<long>();
    EnumWindows((window, param) => {
      var text = new StringBuilder(512); GetWindowText(window, text, text.Capacity);
      if (IsWindowVisible(window) && text.ToString().Contains("MiJarvis Terminal")) windows.Add(window.ToInt64());
      return true;
    }, IntPtr.Zero);
    return windows.ToArray();
  }
}
'@
if ($ListOnly) { ConvertTo-Json -InputObject @([JarvisTerminalProbe]::Windows()) -Compress; exit 0 }
$previous = @($Exclude.Split(',', [System.StringSplitOptions]::RemoveEmptyEntries))
$timer = [System.Diagnostics.Stopwatch]::StartNew()
do {
  $found = @([JarvisTerminalProbe]::Windows() | Where-Object { $previous -notcontains $_.ToString() })
  if ($found.Count -gt 0) { Write-Output "Visible MiJarvis Terminal window verified: $($found[0])"; exit 0 }
  Start-Sleep -Milliseconds 100
} while ($timer.Elapsed.TotalSeconds -lt 8)
throw 'The terminal process did not create a new visible interactive window'
