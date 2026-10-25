# A.I.D.A. window watcher
# Prints the position of every visible app window as one line of JSON, twice a second.
# main.js starts this script and reads what it prints.
# Each window is [id, left, top, right, bottom] in physical screen pixels,
# listed from the frontmost window to the one furthest back.
# This allows A.I.D.A to know where the windows are and to stand on top of them.
param([int]$IgnorePid = 0)

Add-Type @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class AidaWindows {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);

  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left, Top, Right, Bottom; }

  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc callback, IntPtr lParam);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr hWnd, int index);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr hWnd, StringBuilder name, int max);
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr value);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr hWnd, int attribute, out RECT value, int size);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr hWnd, int attribute, out int value, int size);

  const int GWL_EXSTYLE = -20;
  const int WS_EX_TOOLWINDOW = 0x80;
  const int DWMWA_EXTENDED_FRAME_BOUNDS = 9;   // the visible frame, without Windows' invisible borders
  const int DWMWA_CLOAKED = 14;                // hidden windows (other virtual desktops, suspended apps)

  public static void MakeDpiAware() {
    SetProcessDpiAwarenessContext(new IntPtr(-4));   // per-monitor aware: real pixel positions
  }

  public static string List(uint ignorePid) {
    var windows = new List<string>();
    EnumWindows(delegate (IntPtr h, IntPtr l) {
      if (!IsWindowVisible(h) || IsIconic(h) || GetWindowTextLength(h) == 0) return true;
      if ((GetWindowLong(h, GWL_EXSTYLE) & WS_EX_TOOLWINDOW) != 0) return true;

      uint pid;
      GetWindowThreadProcessId(h, out pid);
      if (pid == ignorePid) return true;   // skip A.I.D.A. herself

      var name = new StringBuilder(64);
      GetClassName(h, name, 64);
      string cls = name.ToString();
      if (cls == "Progman" || cls == "WorkerW" || cls == "Shell_TrayWnd" || cls == "Shell_SecondaryTrayWnd") return true;

      int cloaked;
      if (DwmGetWindowAttribute(h, DWMWA_CLOAKED, out cloaked, 4) == 0 && cloaked != 0) return true;

      RECT r;
      if (DwmGetWindowAttribute(h, DWMWA_EXTENDED_FRAME_BOUNDS, out r, 16) != 0) return true;
      if (r.Right - r.Left < 100 || r.Bottom - r.Top < 50) return true;   // too small to sit on

      windows.Add(string.Format("[{0},{1},{2},{3},{4}]", h.ToInt64(), r.Left, r.Top, r.Right, r.Bottom));
      return true;
    }, IntPtr.Zero);
    return "[" + string.Join(",", windows) + "]";
  }
}
"@

[AidaWindows]::MakeDpiAware()
while ($true) {
  [Console]::Out.WriteLine([AidaWindows]::List([uint32]$IgnorePid))
  [Console]::Out.Flush()
  Start-Sleep -Milliseconds 500
}
