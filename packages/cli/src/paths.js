/** All filesystem locations the CLI touches, resolved per platform. */
import { platform } from "node:os";
import { homedir } from "node:os";
import { join } from "node:path";

export const TERN_PLUGIN_ID = "tern-zh-plus";
export const OMP_FILES = ["omp-di18n.ts", "omp-di18n.zh-CN.json"];

export function resolvePaths(overrides = {}) {
  const env = overrides.env ?? process.env;
  const home = overrides.home ?? env.TERN_OMP_ZH_HOME ?? homedir();
  const appData = overrides.appData ?? env.TERN_OMP_ZH_APPDATA ?? env.APPDATA ?? join(home, "AppData", "Roaming");
  const localAppData =
    overrides.localAppData ?? env.TERN_OMP_ZH_LOCALAPPDATA ?? env.LOCALAPPDATA ?? join(home, "AppData", "Local");
  const stateDir = overrides.stateDir ?? env.TERN_OMP_ZH_STATE_DIR ?? join(home, ".tern-omp-zh");
  const ternPluginsDir = overrides.ternPluginsDir ?? join(appData, "Tern", "plugins");
  const ompDir = overrides.ompExtensionsDir ?? join(home, ".omp", "agent", "extensions");

  return {
    home,
    env,
    platform: platform(),
    appData,
    localAppData,
    stateDir,
    stateFile: join(stateDir, "state.json"),
    logFile: join(stateDir, "zh.log"),
    upstreamDir: join(stateDir, "upstream"),
    ternPluginsDir,
    ternTarget: join(ternPluginsDir, TERN_PLUGIN_ID),
    ternLinkFile: join(ternPluginsDir, `${TERN_PLUGIN_ID}.path`),
    ompDir,
    ompFiles: OMP_FILES.map((name) => join(ompDir, name)),
    ompDisabledFiles: OMP_FILES.map((name) => join(ompDir, `${name}.disabled`)),
  };
}
