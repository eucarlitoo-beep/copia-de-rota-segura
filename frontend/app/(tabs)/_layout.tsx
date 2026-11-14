import { NativeTabs } from "expo-router/native-tabs";
import { Tabs } from "expo-router";
import { Platform } from "react-native";

import { F } from "@/src/constants";
import { Icon } from "@/src/components/ui";
import { usesNativeTabs } from "@/src/navigation";
import { useTheme } from "@/src/theme";

const TABS = [
  { name: "index", label: "Início", icon: "home", sf: "house.fill" },
  { name: "mapa", label: "Mapa", icon: "map", sf: "map.fill" },
  { name: "alertas", label: "Alertas", icon: "warning", sf: "exclamationmark.triangle.fill" },
  { name: "perfil", label: "Perfil", icon: "person", sf: "person.fill" },
] as const;

export default function TabsLayout() {
  const { colors } = useTheme();
  if (usesNativeTabs) {
    return (
      <NativeTabs tintColor={colors.brandPrimary}>
        {TABS.map((t) => (
          <NativeTabs.Trigger key={t.name} name={t.name}>
            <NativeTabs.Trigger.Icon sf={t.sf} />
            <NativeTabs.Trigger.Label>{t.label}</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
        ))}
      </NativeTabs>
    );
  }
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, ...(Platform.OS === "web" ? { height: 64 } : {}) },
        tabBarItemStyle: { alignSelf: "center" },
        tabBarLabelStyle: { fontFamily: F.semibold, fontSize: 12 },
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.label,
            tabBarButtonTestID: `tab-${t.name}`,
            tabBarIcon: ({ color, focused }) => <Icon name={(focused ? t.icon : `${t.icon}-outline`) as any} size={24} color={color} />,
          }}
        />
      ))}
    </Tabs>
  );
}
