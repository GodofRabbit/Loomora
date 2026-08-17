const fs = require('fs');
const path = require('path');
const { app, ipcMain } = require('electron');

const ONBOARDING_STATE_FILE = 'onboarding-state.json';

function onboardingStatePath() {
  return path.join(app.getPath('userData'), ONBOARDING_STATE_FILE);
}

function readOnboardingComplete() {
  try {
    const state = JSON.parse(fs.readFileSync(onboardingStatePath(), 'utf8'));
    return state?.onboardingComplete === true;
  } catch {
    return false;
  }
}

function writeOnboardingComplete() {
  const target = onboardingStatePath();
  fs.writeFileSync(
    target,
    JSON.stringify({ onboardingComplete: true }, null, 2),
    'utf8',
  );
}

function registerPreferenceHandlers() {
  ipcMain.handle('get-onboarding-complete', () => readOnboardingComplete());
  ipcMain.handle('set-onboarding-complete', () => {
    writeOnboardingComplete();
    return true;
  });
}

module.exports = { registerPreferenceHandlers };
