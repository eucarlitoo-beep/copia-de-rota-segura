import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { errMsg } from "@/src/api";
import { useAuth } from "@/src/auth";
import { DRIVER_TYPES, F, R, S } from "@/src/constants";
import { PrivacyText } from "@/src/components/PrivacyText";
import { Btn, Field, Icon, ScreenHeader, Sheet, Txt } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";

export default function Register() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { register } = useAuth();
  const [f, setF] = useState({ name: "", email: "", phone: "", password: "", driver_type: "aplicativo" });
  const [consent, setConsent] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const set = (k: string) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (f.name.trim().length < 2) return setError("Informe seu nome.");
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) return setError("Informe um e-mail válido.");
    if (f.password.length < 8) return setError("A senha deve ter pelo menos 8 caracteres.");
    if (!consent) return setError("Aceite a Política de Privacidade para continuar.");
    setLoading(true);
    setError("");
    try {
      await register({ ...f, email: f.email.trim(), name: f.name.trim(), lgpd_consent: true });
      router.replace("/(tabs)");
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={s.root}>
      <ScreenHeader title="Criar conta" />
      <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={{ padding: S.xl, paddingBottom: insets.bottom + S.xl }} keyboardShouldPersistTaps="handled">
        <Field testID="register-name-input" label="Nome completo" value={f.name} onChangeText={set("name")} placeholder="Como você quer ser chamado" />
        <Field testID="register-email-input" label="E-mail" value={f.email} onChangeText={set("email")} autoCapitalize="none" keyboardType="email-address" placeholder="seu@email.com" />
        <Field testID="register-phone-input" label="Celular (opcional)" value={f.phone} onChangeText={set("phone")} keyboardType="phone-pad" placeholder="(11) 99999-9999" />
        <Field testID="register-password-input" label="Senha" value={f.password} onChangeText={set("password")} secureTextEntry placeholder="Mínimo 8 caracteres" />
        <Txt variant="label">Você é motorista de</Txt>
        <View style={s.types}>
          {DRIVER_TYPES.map((t) => {
            const on = f.driver_type === t.key;
            return (
              <Pressable key={t.key} testID={`driver-type-${t.key}`} onPress={() => set("driver_type")(t.key)} style={[s.type, on && s.typeOn]}>
                <Txt style={[s.typeText, on && { color: colors.onBrand }]}>{t.label}</Txt>
              </Pressable>
            );
          })}
        </View>
        <Pressable testID="register-consent-checkbox" onPress={() => setConsent(!consent)} style={s.consent} accessibilityRole="checkbox" accessibilityState={{ checked: consent }}>
          <View style={[s.box, consent && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }]}>
            {consent ? <Icon name="checkmark" size={18} color={colors.onBrandPrimary} /> : null}
          </View>
          <Txt style={{ flex: 1 }}>
            Li e aceito a{" "}
            <Txt testID="register-terms-link" style={s.link}>Política de Privacidade (LGPD)</Txt>
          </Txt>
        </Pressable>
        <Btn testID="register-view-terms" label="Ler a política" variant="ghost" small onPress={() => setShowTerms(true)} style={{ alignSelf: "flex-start", marginBottom: S.md }} />
        {error ? <Txt testID="register-error" style={s.error}>{error}</Txt> : null}
        <Btn testID="register-submit-button" label="Criar minha conta" onPress={submit} loading={loading} />
      </KeyboardAwareScrollView>
      <Sheet visible={showTerms} onClose={() => setShowTerms(false)} testID="terms-sheet">
        <PrivacyText />
        <Btn testID="terms-close" label="Entendi" onPress={() => setShowTerms(false)} style={{ marginTop: S.lg }} />
      </Sheet>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  types: { flexDirection: "row", gap: S.sm, marginBottom: S.lg },
  type: { flex: 1, minHeight: 52, borderRadius: R.md, borderWidth: 1.5, borderColor: c.border, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceSecondary },
  typeOn: { backgroundColor: c.brand, borderColor: c.brand },
  typeText: { fontFamily: F.semibold, fontSize: 14, color: c.onSurface },
  consent: { flexDirection: "row", alignItems: "center", gap: S.md, minHeight: 48 },
  box: { width: 28, height: 28, borderRadius: 8, borderWidth: 2, borderColor: c.borderStrong, alignItems: "center", justifyContent: "center" },
  link: { color: c.brandSecondary, fontFamily: F.bold },
  error: { color: c.error, fontFamily: F.semibold, marginBottom: S.md },
}));
