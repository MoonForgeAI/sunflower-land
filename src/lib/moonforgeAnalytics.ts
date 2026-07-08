import { MoonForgeAnalytics, MoonForgeErrorTracker } from "lib/moonforge";

/**
 * MoonForge game analytics for Sunflower Land.
 *
 * Thin wrapper around the MoonForge Web SDK. Keeps every call site in game
 * code down to a one-liner and gives us a single place to swap out or
 * extend the underlying analytics provider.
 *
 * The SDK itself is a safe no-op before `MoonForgeAnalytics.init` has run
 * (e.g. during SSR/build or before app bootstrap completes), so these
 * helpers do not need their own guards.
 */
export const MOONFORGE_GAME_ID = "a1c35b7b-049b-4662-8a6c-2b0476080671";

/**
 * Tracks a one-off game event with optional properties.
 * Do not include scene, device, or language - these are auto-collected.
 */
export function mfTrack(name: string, data?: Record<string, unknown>): void {
  try {
    MoonForgeAnalytics.trackEvent(name, data);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log(`MoonForge analytics error: `, e);
  }
}

/**
 * Tracks a screen/scene view.
 */
export function mfScreen(name: string): void {
  try {
    MoonForgeAnalytics.trackScreenView(name);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log(`MoonForge analytics error: `, e);
  }
}

/**
 * Identifies the current player for analytics.
 */
export function mfIdentify(
  userId: string,
  traits?: Record<string, unknown>,
): void {
  try {
    MoonForgeAnalytics.identify(userId, traits);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log(`MoonForge analytics error: `, e);
  }
}

/**
 * Updates the current scene name on the error tracker's game state, so any
 * error captured afterwards is tagged with where the player is.
 */
export function mfSetScene(sceneName: string): void {
  try {
    MoonForgeErrorTracker.setGameState({ sceneName });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log(`MoonForge analytics error: `, e);
  }
}
