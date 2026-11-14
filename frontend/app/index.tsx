import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";

import { useAuth } from "@/src/auth";
import { Txt } from "@/src/components/ui";
import { useTheme } from "@/src/theme";

export default function Index() {
  const { user, loading } = useAuth();
  const { colors } = useTheme();
  if (loading)
    return (
      <View style={{ flex: 1, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", gap: 16 }}>
        <ActivityIndicator color={colors.brandPrimary} size="large" />
        <Txt style={{ color: colors.onBrand }}>Conectando à rede segura...</Txt>
      </View>
    );
  return <Redirect href={user ? "/(tabs)" : "/login"} />;
}
