import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import type { TodayRegion, TodayRegionConfig } from './types.js';

export const TODAY_OAUTH_CLIENT_ID = 'Bh2VwEojzfuJw4kBGuLQf3wxGEoupUnx';
export const TODAY_PROVIDER_CN = 'today';
export const TODAY_PROVIDER_GLOBAL = 'today-global';

export const TODAY_AUTH_DIR_ENV = 'TODAY_AUTH_DIR';
export const TODAY_REGION_ENV = 'TODAY_REGION';

export function resolveDesktopUserDataDir(productDirName: string): string {
  const override = process.env[TODAY_AUTH_DIR_ENV]?.trim();
  if (override) {
    return override;
  }
  const platform = process.platform;
  if (platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, productDirName);
  }
  if (platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', productDirName);
  }
  const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(configHome, productDirName);
}

export function executableCandidatesFor(region: TodayRegion): string[] {
  const platform = process.platform;
  if (platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    if (region === 'cn') {
      return [
        path.join(localAppData, 'Programs', 'Today CN', 'TodayCN.exe'),
        path.join('C:\\Program Files', 'Today CN', 'TodayCN.exe'),
      ];
    }
    return [
      path.join(localAppData, 'Programs', 'Today', 'Today.exe'),
      path.join('C:\\Program Files', 'Today', 'Today.exe'),
    ];
  }
  if (platform === 'darwin') {
    if (region === 'cn') {
      return ['/Applications/Today CN.app/Contents/MacOS/Today CN'];
    }
    return ['/Applications/Today.app/Contents/MacOS/Today'];
  }
  return region === 'cn' ? ['/usr/bin/today-cn'] : ['/usr/bin/today'];
}

export function getRegionConfig(region: TodayRegion, customUserDataDir?: string): TodayRegionConfig {
  if (region === 'cn') {
    return {
      region: 'cn',
      providerId: TODAY_PROVIDER_CN,
      displayName: 'Today CN',
      productName: 'Today CN',
      apiBaseUrl: 'https://api.todayai.cn',
      authBaseUrl: 'https://auth.todayai.cn',
      webOrigin: 'https://todayai.cn',
      oauthClientId: TODAY_OAUTH_CLIENT_ID,
      userDataDir: customUserDataDir ?? resolveDesktopUserDataDir('Today CN'),
      executableCandidates: executableCandidatesFor('cn'),
    };
  }
  return {
    region: 'global',
    providerId: TODAY_PROVIDER_GLOBAL,
    displayName: 'Today Global',
    productName: 'Today',
    apiBaseUrl: 'https://api.today.ai',
    authBaseUrl: 'https://auth.today.ai',
    webOrigin: 'https://today.ai',
    oauthClientId: TODAY_OAUTH_CLIENT_ID,
    userDataDir: customUserDataDir ?? resolveDesktopUserDataDir('Today'),
    executableCandidates: executableCandidatesFor('global'),
  };
}

export function detectInstalledRegion(preferred?: TodayRegion): TodayRegionConfig {
  const envRegion = process.env[TODAY_REGION_ENV]?.trim().toLowerCase();
  if (preferred) {
    return getRegionConfig(preferred);
  }
  if (envRegion === 'cn' || envRegion === 'global') {
    return getRegionConfig(envRegion);
  }
  const cnConfig = getRegionConfig('cn');
  if (fs.existsSync(path.join(cnConfig.userDataDir, 'account-credentials.head'))) {
    return cnConfig;
  }
  const globalConfig = getRegionConfig('global');
  if (fs.existsSync(path.join(globalConfig.userDataDir, 'account-credentials.head'))) {
    return globalConfig;
  }
  return cnConfig;
}

export function findInstalledExecutable(region: TodayRegion): string | undefined {
  for (const candidate of executableCandidatesFor(region)) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}
