using System;

public class CPHInline
{
    // Called by the dock over the Streamer.bot WebSocket (DoAction) with:
    //   registry : delimited site list for the watcher  (\u001E records, \u001F fields)
    //   config   : full JSON config for the overlay (appearance + behavior)
    public bool Execute()
    {
        string registry = null;
        string config = null;
        CPH.TryGetArg("registry", out registry);
        CPH.TryGetArg("config", out config);

        if (registry != null) CPH.SetGlobalVar("ww_registry", registry, true);
        if (config != null)   CPH.SetGlobalVar("ww_config", config, true);

        CPH.LogInfo("[WW] Config saved (registry chars=" + (registry == null ? 0 : registry.Length)
                    + ", config chars=" + (config == null ? 0 : config.Length) + ")");
        return true;
    }
}
