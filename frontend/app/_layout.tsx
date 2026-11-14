import { QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { LogBox, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { AuthProvider } from "@/src/auth";
import { ErrorBoundary } from "@/src/components/error-boundary";
import { ToastProvider } from "@/src/components/ui";
import { queryClient } from "@/src/query-client";
import { useTheme } from "@/src/theme";

// Disable logbox errors etc so that users can see the app
// and agent works as expected.
LogBox.ignoreAllLogs(true);

export default function RootLayout() {
  const { colors } = useTheme();
  const [loaded, error] = useFonts({
    "PJS-Regular": require("../assets/fonts/PlusJakartaSans-Regular.ttf"),
    "PJS-Medium": require("../assets/fonts/PlusJakartaSans-Medium.ttf"),
    "PJS-SemiBold": require("../assets/fonts/PlusJakartaSans-SemiBold.ttf"),
    "PJS-Bold": require("../assets/fonts/PlusJakartaSans-Bold.ttf"),
    "PJS-ExtraBold": require("../assets/fonts/PlusJakartaSans-ExtraBold.ttf"),
    Ionicons: require("@react-native-vector-icons/ionicons/fonts/Ionicons.ttf"),
  });
  if (!loaded && !error) return null;

  // One app level ErrorBoundary; GestureHandlerRootView must wrap the whole tree.
  return (
    <GestureHandlerRootView style={styles.root}>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <KeyboardProvider>
              <AuthProvider>
                <ToastProvider>
                  <StatusBar style="light" />
                  <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surfaceSecondary } }} />
                </ToastProvider>
              </AuthProvider>
          </KeyboardProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
