import { Stack } from "expo-router";

/**
 * TEMPORARY ROOT LAYOUT (OPTION A)
 * --------------------------------
 * - Auth is intentionally bypassed
 * - No redirects
 * - No role checks
 * - App always renders
 *
 * REMOVE THIS FILE when real auth is introduced
 */

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    />
  );
}
