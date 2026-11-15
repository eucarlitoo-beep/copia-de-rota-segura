const appConfig = require("./app.json").expo;
const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID || appConfig.extra?.eas?.projectId;

module.exports = {
  ...appConfig,
  ...(projectId
    ? { extra: { ...appConfig.extra, eas: { ...appConfig.extra?.eas, projectId } } }
    : {}),
};
