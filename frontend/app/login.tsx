import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { errMsg } from "@/src/api";
import { useAuth } from "@/src/auth";
import { F, R, S } from "@/src/constants";
import { Btn, Field, Icon, Txt } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";

export default function Login() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password) return setError("Informe e-mail e senha.");
    setLoading(true);
    setError("");
    try {
      await login(email.trim(), password);
      router.replace("/(tabs)");
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={s.root}>
      <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={[s.hero, { paddingTop: insets.top + S.xxl }]}>
          <View style={s.logo}>
            <Icon name="shield-checkmark" size={44} color={colors.onBrandPrimary} />
          </View>
          <Txt style={s.brand}>ROTA SEGURA</Txt>
          <Txt style={s.slogan}>Sua segurança em primeiro lugar</Txt>
        </View>
        <View style={[s.form, { paddingBottom: insets.bottom + S.xl }]}>
          <Txt variant="h2" style={{ marginBottom: S.lg }}>Entrar na sua conta</Txt>
          <Field testID="login-email-input" label="E-mail" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder="seu@email.com" />
          <Field testID="login-password-input" label="Senha" value={password} onChangeText={setPassword} secureTextEntry placeholder="Sua senha" onSubmitEditing={submit} />
          {error ? <Txt testID="login-error" style={s.error}>{error}</Txt> : null}
          <Btn testID="login-submit-button" label="Entrar" onPress={submit} loading={loading} />
          <Btn testID="go-register-button" label="Criar conta gratuita" variant="outline" onPress={() => router.push("/register")} style={{ marginTop: S.md }} />
          <Txt variant="small" style={{ marginTop: S.xl, textAlign: "center" }}>
            Em emergência, ligue 190 (Polícia), 192 (SAMU) ou 193 (Bombeiros).
          </Txt>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.brand },
  hero: { alignItems: "center", paddingBottom: S.xxl, paddingHorizontal: S.xl },
  logo: { width: 84, height: 84, borderRadius: R.lg, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center", marginBottom: S.lg },
  brand: { fontFamily: F.black, fontSize: 32, color: c.onBrand, letterSpacing: 1 },
  slogan: { fontFamily: F.medium, fontSize: 16, color: c.brandTertiary, marginTop: S.xs },
  form: { flex: 1, backgroundColor: c.surface, borderTopLeftRadius: R.lg + 8, borderTopRightRadius: R.lg + 8, padding: S.xl },
  error: { color: c.error, fontFamily: F.semibold, marginBottom: S.md },
}));
