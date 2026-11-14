import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, errMsg } from "@/src/api";
import { useAuth, User } from "@/src/auth";
import { DRIVER_TYPES, F, R, S } from "@/src/constants";
import { Btn, Field, ScreenHeader, Txt, useToast } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";

export default function ProfileEdit() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { user, setUser } = useAuth();
  const [f, setF] = useState({ name: user?.name ?? "", phone: user?.phone ?? "", driver_type: user?.driver_type ?? "aplicativo", vehicle: user?.vehicle ?? "", city: user?.city ?? "" });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  const save = async () => {
    if (f.name.trim().length < 2) return toast("Informe seu nome.", "error");
    setBusy(true);
    try {
      setUser(await api<User>("/profile", { method: "PUT", body: f }));
      toast("Perfil atualizado.", "success");
      router.back();
    } catch (e) {
      toast(errMsg(e), "error");
    }
    setBusy(false);
  };

  return (
    <View style={s.root}>
      <ScreenHeader title="Editar perfil" />
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: S.xl, paddingBottom: insets.bottom + S.xl }}>
        <Field testID="profile-name-input" label="Nome" value={f.name} onChangeText={set("name")} />
        <Field testID="profile-phone-input" label="Celular" value={f.phone} onChangeText={set("phone")} keyboardType="phone-pad" />
        <Txt variant="label">Tipo de motorista</Txt>
        <View style={s.types}>
          {DRIVER_TYPES.map((t) => (
            <Pressable key={t.key} testID={`profile-type-${t.key}`} onPress={() => set("driver_type")(t.key)} style={[s.type, f.driver_type === t.key && s.typeOn]}>
              <Txt style={[s.typeText, f.driver_type === t.key && { color: colors.onBrand }]}>{t.label}</Txt>
            </Pressable>
          ))}
        </View>
        <Field testID="profile-vehicle-input" label="Veículo (modelo e cor, opcional)" value={f.vehicle} onChangeText={set("vehicle")} placeholder="Ex.: Onix prata" />
        <Field testID="profile-city-input" label="Cidade" value={f.city} onChangeText={set("city")} placeholder="Ex.: sua cidade - UF" />
        <Btn testID="profile-save-button" label="Salvar" onPress={save} loading={busy} />
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  types: { flexDirection: "row", gap: S.sm, marginBottom: S.lg },
  type: { flex: 1, minHeight: 52, borderRadius: R.md, borderWidth: 1.5, borderColor: c.border, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceSecondary },
  typeOn: { backgroundColor: c.brand, borderColor: c.brand },
  typeText: { fontFamily: F.semibold, fontSize: 14, color: c.onSurface },
}));
