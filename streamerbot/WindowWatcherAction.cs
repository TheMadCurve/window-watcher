using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

public class CPHInline
{
    private const string REGISTRY_VAR = "ww_registry";
    private const string SNAPSHOT_VAR = "wtw_snapshot";

    private const string RS = "\u001E";
    private const string US = "\u001F";
    private const string MediaSeparator = " \u2022 ";

    private static readonly string[] BrowserSuffixes =
    {
        " \u2014 Mozilla Firefox",
        " - Google Chrome",
        " - Microsoft\u200B Edge",
        " - Microsoft Edge",
    };
    private static readonly string[] SkipMarkers = { "Private Browsing", "InPrivate", "Incognito" };

    // Used only until the dock saves a registry. Fields: key US label US suffix US mode US color
    private static readonly string DefaultRegistry =
        "youtube" + US + "YouTube" + US + " - YouTube" + US + "full"  + US + "#ff4d4d" + RS +
        "spotify" + US + "Spotify" + US + " | Spotify" + US + "media" + US + "#1ed760";

    private class SiteRule { public string Key; public string Label; public string Suffix; public string Mode; public string Color; }

    private class ParseResult
    {
        public string SiteKey; public string Label; public string State;
        public string Primary; public string Secondary; public string Color;
        public string Signature()
        {
            return SiteKey + "\u0001" + State + "\u0001" + (Primary ?? "") + "\u0001" + (Secondary ?? "");
        }
    }

    private const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
    private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsProc cb, IntPtr p);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowTextW(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] private static extern int GetWindowTextLength(IntPtr h);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr h);

    private List<SiteRule> LoadRegistry()
    {
        string raw = CPH.GetGlobalVar<string>(REGISTRY_VAR, true);
        if (string.IsNullOrEmpty(raw)) raw = DefaultRegistry;

        var rules = new List<SiteRule>();
        foreach (string rec in raw.Split(new[] { RS }, StringSplitOptions.RemoveEmptyEntries))
        {
            string[] f = rec.Split(new[] { US }, StringSplitOptions.None);
            if (f.Length < 4) continue;
            if (string.IsNullOrEmpty(f[2])) continue;
            rules.Add(new SiteRule
            {
                Key = f[0], Label = f[1], Suffix = f[2], Mode = f[3],
                Color = f.Length >= 5 ? f[4] : ""
            });
        }
        return rules;
    }

    private static string StripLeadingBadge(string text)
    {
        if (text.Length < 3 || text[0] != '(') return text;
        int close = text.IndexOf(')');
        if (close < 2) return text;
        for (int i = 1; i < close; i++)
            if (!char.IsDigit(text[i])) return text;
        return text.Substring(close + 1).TrimStart();
    }

    private ParseResult Parse(string rawTitle, List<SiteRule> rules)
    {
        foreach (string m in SkipMarkers)
            if (rawTitle.IndexOf(m, StringComparison.OrdinalIgnoreCase) >= 0) return null;

        string page = null;
        foreach (string suffix in BrowserSuffixes)
        {
            if (rawTitle.EndsWith(suffix, StringComparison.Ordinal))
            {
                page = rawTitle.Substring(0, rawTitle.Length - suffix.Length).Trim();
                break;
            }
        }
        if (string.IsNullOrEmpty(page)) return null;

        foreach (SiteRule rule in rules)
        {
            if (!page.EndsWith(rule.Suffix, StringComparison.Ordinal)) continue;
            string content = StripLeadingBadge(page.Substring(0, page.Length - rule.Suffix.Length).Trim());
            var r = new ParseResult { SiteKey = rule.Key, Label = rule.Label, Color = rule.Color };
            if (rule.Mode == "media") r.State = "idle";
            else { r.State = "browsing"; r.Primary = content; }
            return r;
        }

        int bullet = page.IndexOf(MediaSeparator, StringComparison.Ordinal);
        if (bullet > 0)
        {
            SiteRule media = rules.Find(x => x.Mode == "media");
            if (media != null)
            {
                return new ParseResult
                {
                    SiteKey = media.Key, Label = media.Label, State = "playing", Color = media.Color,
                    Primary = page.Substring(0, bullet).Trim(),
                    Secondary = page.Substring(bullet + MediaSeparator.Length).Trim()
                };
            }
        }
        return null;
    }

    private static string Esc(string s)
    {
        if (string.IsNullOrEmpty(s)) return "";
        var sb = new StringBuilder(s.Length + 8);
        foreach (char c in s)
        {
            switch (c)
            {
                case '\\': sb.Append("\\\\"); break;
                case '"':  sb.Append("\\\""); break;
                case '\n': sb.Append("\\n");  break;
                case '\r': sb.Append("\\r");  break;
                case '\t': sb.Append("\\t");  break;
                default:
                    if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4"));
                    else sb.Append(c);
                    break;
            }
        }
        return sb.ToString();
    }
    private static string JsonStr(string s) => s == null ? "null" : "\"" + Esc(s) + "\"";

    private static string BuildJson(ParseResult p, bool reshow)
    {
        var sb = new StringBuilder();
        sb.Append('{');
        sb.Append("\"v\":1,");
        sb.Append("\"type\":\"").Append(reshow ? "reshow" : "pop").Append("\",");
        sb.Append("\"site\":\"").Append(Esc(p.SiteKey)).Append("\",");
        sb.Append("\"label\":\"").Append(Esc(p.Label)).Append("\",");
        sb.Append("\"state\":\"").Append(Esc(p.State)).Append("\",");
        sb.Append("\"color\":").Append(JsonStr(string.IsNullOrEmpty(p.Color) ? null : p.Color)).Append(',');
        sb.Append("\"primary\":").Append(JsonStr(p.Primary)).Append(',');
        sb.Append("\"secondary\":").Append(JsonStr(p.Secondary)).Append(',');
        sb.Append("\"ts\":").Append(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        sb.Append('}');
        return sb.ToString();
    }

    public bool Execute()
    {
        string mode = null;
        CPH.TryGetArg("mode", out mode);
        bool reshow = string.Equals(mode, "reshow", StringComparison.OrdinalIgnoreCase);

        List<SiteRule> rules = LoadRegistry();

        var current = new Dictionary<long, ParseResult>();
        EnumWindowsProc callback = (hWnd, lParam) =>
        {
            if (!IsWindowVisible(hWnd)) return true;
            int len = GetWindowTextLength(hWnd);
            if (len <= 0) return true;
            var buf = new StringBuilder(len + 1);
            GetWindowTextW(hWnd, buf, buf.Capacity);
            string title = buf.ToString().Trim();
            if (title.Length == 0) return true;
            ParseResult parsed = Parse(title, rules);
            if (parsed != null) current[hWnd.ToInt64()] = parsed;
            return true;
        };
        EnumWindows(callback, IntPtr.Zero);

        var previous = new Dictionary<long, string>();
        string stored = CPH.GetGlobalVar<string>(SNAPSHOT_VAR, false);
        if (!string.IsNullOrEmpty(stored))
        {
            foreach (string record in stored.Split(new[] { RS }, StringSplitOptions.RemoveEmptyEntries))
            {
                int sep = record.IndexOf(US, StringComparison.Ordinal);
                if (sep <= 0) continue;
                long key;
                if (long.TryParse(record.Substring(0, sep), out key))
                    previous[key] = record.Substring(sep + 1);
            }
        }

        var emit = new List<ParseResult>();
        foreach (var kv in current)
        {
            if (reshow) { emit.Add(kv.Value); continue; }
            string sig = kv.Value.Signature();
            string old;
            if (!previous.TryGetValue(kv.Key, out old) || old != sig)
                emit.Add(kv.Value);
        }

        var sb = new StringBuilder();
        foreach (var kv in current)
            sb.Append(kv.Key).Append(US).Append(kv.Value.Signature()).Append(RS);
        CPH.SetGlobalVar(SNAPSHOT_VAR, sb.ToString(), false);

        foreach (ParseResult p in emit)
        {
            CPH.WebsocketBroadcastJson(BuildJson(p, reshow));
            string line = (reshow ? "SHOW " : "POP  ") + p.SiteKey.PadRight(9) + "| "
                        + p.State.PadRight(9) + "| " + (p.Primary ?? p.Label);
            if (!string.IsNullOrEmpty(p.Secondary)) line += "  ~  " + p.Secondary;
            CPH.LogInfo("[Watch] " + line);
        }

        if (reshow && emit.Count == 0)
            CPH.LogInfo("[Watch] reshow: nothing matched (" + rules.Count + " sites watched)");
        else if (!reshow && emit.Count == 0)
            CPH.LogDebug("[Watch] no change (" + current.Count + " matched)");

        return true;
    }
}
