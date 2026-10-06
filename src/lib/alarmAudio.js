import lightWarningSound from '../../alarmsounds/lw.wav';
import firstAlarmSound from '../../alarmsounds/1st.mp3';
import secondAlarmSound from '../../alarmsounds/2nd.mp3';
import thirdAlarmSound from '../../alarmsounds/3rd.mp3';
import fourthAlarmSound from '../../alarmsounds/4th.mp3';
import fifthAlarmSound from '../../alarmsounds/5th.mp3';
import incoFireSound from '../../alarmsounds/incoFIre.mp3';

const SOUND_BY_LEVEL = [
  lightWarningSound,
  firstAlarmSound,
  secondAlarmSound,
  thirdAlarmSound,
  fourthAlarmSound,
  fifthAlarmSound,
];

let soundUnlocked = false;

/**
 * Keep volume at the browser default so the phone or computer system volume
 * remains the final volume control. Playback may be blocked until interaction.
 */
export async function enableAlarmSounds() {
  const audio = new Audio(SOUND_BY_LEVEL[1]);
  audio.volume = 0;
  try {
    await audio.play();
    audio.pause();
    audio.currentTime = 0;
    soundUnlocked = true;
    return true;
  } catch {
    return false;
  }
}

export async function playAlarmSound(level) {
  const source = SOUND_BY_LEVEL[level] ?? SOUND_BY_LEVEL[0];
  const audio = new Audio(source);
  audio.volume = 1;
  try {
    await audio.play();
    soundUnlocked = true;
    return true;
  } catch {
    // Browsers can block autoplay; the caller can ask for a user gesture.
    return false;
  }
}

export async function playAdminReportSound() {
  if (!soundUnlocked) {
    const unlocked = await enableAlarmSounds();
    if (!unlocked) return false;
  }

  const audio = new Audio(incoFireSound);
  audio.volume = 1;
  try {
    await audio.play();
    soundUnlocked = true;
    return true;
  } catch {
    return false;
  }
}

export const alarmSoundsUnlocked = () => soundUnlocked;

