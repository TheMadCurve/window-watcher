using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public class CPHInline
{
    // Must match the watcher's browser suffixes.
    private static readonly string[] BrowserSuffixes =
    {
        " \u2014 Mozilla Firefox",
        " - Google Chrome",
        " - Microsoft\u200B Edge",
        " - Microsoft Edge",
    };

    // Separators that typically sit before a site name in a tab title.
    // Note: the bullet ( \u2022 ) is intentionally excluded — it separates
    // track and artist for media sites, not a site name.
    private static readonly string[] SiteSeps = { " - ", " | ", " \u2013 ", " \u00b7 " };

    private delegate bool EnumWindowsProc(IntPtr h, IntPtr l);
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsProc cb, IntPtr p);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowTextW(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] private static extern int GetWindowTextLength(IntPtr h);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr h);

    private static string Esc(string s)
    {
        if (string.IsNullOrEmpty(s)) return "";
        var sb = new StringBuilder(s.Length + 8);
        foreach (char c in s)
        {
            if (c == '\\') sb.Append("\\\\");
            else if (c == '"') sb.Append("\\\"");
            else if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4"));
            else sb.Append(c);
        }
        return sb.ToString();
    }

    public bool Execute()
    {
        var items = new List<string>();
        var seen = new HashSet<string>();

        EnumWindowsProc cb = (h, l) =>
        {
            if (!IsWindowVisible(h)) return true;
            int len = GetWindowTextLength(h);
            if (len <= 0) return true;
            var b = new StringBuilder(len + 1);
            GetWindowTextW(h, b, b.Capacity);
            string t = b.ToString().Trim();
            if (t.Length == 0) return true;

            // browser windows only
            string page = null;
            foreach (string suf in BrowserSuffixes)
                if (t.EndsWith(suf, StringComparison.Ordinal)) { page = t.Substring(0, t.Length - suf.Length).Trim(); break; }
            if (string.IsNullOrEmpty(page)) return true;
            if (!seen.Add(page)) return true;

            // candidate suffix = last site separator to end of title
            int best = -1;
            foreach (string sep in SiteSeps)
            {
                int idx = page.LastIndexOf(sep, StringComparison.Ordinal);
                if (idx > best) best = idx;
            }
            string suffix = best > 0 ? page.Substring(best) : "";

            items.Add("{\"page\":\"" + Esc(page) + "\",\"suffix\":\"" + Esc(suffix) + "\"}");
            return true;
        };
        EnumWindows(cb, IntPtr.Zero);

        CPH.WebsocketBroadcastJson("{\"v\":1,\"type\":\"windows\",\"list\":[" + string.Join(",", items) + "]}");
        CPH.LogInfo("[WW] Get Windows: " + items.Count + " browser window(s)");
        return true;
    }
}
