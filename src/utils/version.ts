import packageInfo from '../../package.json';

export const getAppVersion = (): string => {
  return packageInfo.version;
};

export const getVersionDisplay = (): string => {
  return `v${packageInfo.version}`;
}; 