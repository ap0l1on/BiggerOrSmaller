// Rename the whole project here. Everything (title, share text, storage keys)
// derives from these constants.
export const APP_NAME = "Bigger or Smaller";
export const APP_TAGLINE = "Which company is worth more?";
export const STORAGE_PREFIX = "bos";
/** Previous prefix, read once to carry best scores over the rename. */
export const LEGACY_STORAGE_PREFIX = "outweigh";
export const DAILY_COUNT = 10;
export const RECENT_MEMORY = 30;
export const NEAR_TIE_RATIO = 1.03;

export const SHARE_EMOJI_UP = "\u{1F4C8}";

export function siteUrl(): string {
  try {
    return window.location.host + window.location.pathname;
  } catch {
    return "";
  }
}
