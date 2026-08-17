const fs = require('fs');
const path = require('path');
const { app, ipcMain } = require('electron');

const ONBOARDING_STATE_FILE = 'onboarding-state.json';
const ONBOARDING_VERSION = 2;

function onboardingStatePath() {
  return path.join(app.getPath('userData'), ONBOARDING_STATE_FILE);
}

function readOnboardingComplete() {
  try {
    const state = JSON.parse(fs.readFileSync(onboardingStatePath(), 'utf8'));
    return (
      state?.onboardingComplete === true &&
      Number(state?.onboardingVersion || 0) >= ONBOARDING_VERSION
    );
  } catch {
    return false;
  }
}

function writeOnboardingComplete() {
  const target = onboardingStatePath();
  const temporaryTarget = `${target}.tmp`;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(
    temporaryTarget,
    JSON.stringify(
      {
        onboardingComplete: true,
        onboardingVersion: ONBOARDING_VERSION,
      },
      null,
      2,
    ),
    'utf8',
  );
  fs.renameSync(temporaryTarget, target);
}

function registerPreferenceHandlers() {
  ipcMain.handle('get-onboarding-complete', () => readOnboardingComplete());
  ipcMain.handle('set-onboarding-complete', () => {
    writeOnboardingComplete();
    return true;
  });
}

module.exports = { registerPreferenceHandlers };
