import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, View } from "react-native";
import * as AuthSession from "expo-auth-session";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { errMsg } from "@/src/api";
import { useAuth } from "@/src/auth";
import { F, R, S } from "@/src/constants";
import { Btn, Field, Icon, Txt } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";

WebBrowser.maybeCompleteAuthSession();

const googleClientId = Platform.OS === "ios"
  ? process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID
  : Platform.OS === "android"
    ? process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID
    : process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const googleDiscovery = {
  authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
};

export default function Login() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { login, socialLogin } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [remember, setRemember] = useState(true);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const nonce = useMemo(() => Crypto.randomUUID(), []);
  const redirectUri = AuthSession.makeRedirectUri({ scheme: "rotasegura", path: "oauth" });
  const [googleRequest, , promptGoogleAsync] = AuthSession.useAuthRequest({
    clientId: googleClientId,
    redirectUri,
    responseType: AuthSession.ResponseType.Code,
    scopes: ["openid", "email", "profile"],
    usePKCE: true,
    extraParams: { prompt: "select_account", nonce },
  }, googleDiscovery);

  useEffect(() => {
    if (Platform.OS === "ios") AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => setAppleAvailable(false));
  }, []);

  const signInGoogle = async () => {
    setError("");
    if (!googleClientId) return setError("Login Google ainda não está configurado neste app.");
    if (!googleRequest) return setError("Aguarde a inicialização do acesso Google e tente novamente.");
    setLoading(true);
    try {
      const result = await promptGoogleAsync();
      if (result.type === "cancel" || result.type === "dismiss") return;
      if (result.type !== "success" || !result.params.code || !googleRequest.codeVerifier) throw new Error("Não foi possível concluir o acesso Google.");
      const tokens = await AuthSession.exchangeCodeAsync({
        clientId: googleClientId,
        code: result.params.code,
        redirectUri,
        extraParams: { code_verifier: googleRequest.codeVerifier },
      }, googleDiscovery);
      if (!tokens.idToken) throw new Error("O Google não retornou uma identidade verificável.");
      await socialLogin("google", tokens.idToken, nonce, remember);
      router.replace("/(tabs)");
    } catch (e) { setError(errMsg(e)); }
    finally { setLoading(false); }
  };

  const signInApple = async () => {
    setError("");
    if (!appleAvailable) return setError("O acesso Apple está disponível em dispositivos Apple compatíveis.");
    setLoading(true);
    try {
      const credential = await AppleAuthentication.signInAsync({
        nonce,
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL, AppleAuthentication.AppleAuthenticationScope.FULL_NAME],
      });
      if (!credential.identityToken) throw new Error("A Apple não retornou uma identidade verificável.");
      await socialLogin("apple", credential.identityToken, nonce, remember);
      router.replace("/(tabs)");
    } catch (e) {
      if ((e as { code?: string })?.code !== "ERR_REQUEST_CANCELED") setError(errMsg(e));
    } finally { setLoading(false); }
  };

  const submit = async () => {
    if (!email.trim() || !password) return setError("Informe e-mail e senha.");
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Digite um endereço de e-mail válido.");
    setLoading(true);
    setError("");
    try {
      await login(email.trim().toLowerCase(), password, remember);
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
          <Pressable testID="login-remember-toggle" accessibilityRole="checkbox" accessibilityState={{ checked: remember }} onPress={() => setRemember((value) => !value)} style={s.remember}>
            <View style={[s.checkbox, remember && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }]}>{remember ? <Icon name="checkmark" size={14} color={colors.onBrandPrimary} /> : null}</View>
            <Txt style={{ flex: 1 }}>Manter conectado neste dispositivo</Txt>
          </Pressable>
          <Btn testID="login-forgot-password" label="Esqueci minha senha" variant="ghost" onPress={() => router.push("/forgot-password")} />
          {error ? <Txt testID="login-error" style={s.error}>{error}</Txt> : null}
          <Btn testID="login-submit-button" label="Entrar" onPress={submit} loading={loading} />
          <View style={s.divider}><View style={s.rule} /><Txt variant="small">ou continue com</Txt><View style={s.rule} /></View>
          <Btn testID="login-google-button" label="Continuar com Google" icon="logo-google" variant="outline" onPress={signInGoogle} loading={loading} disabled={!googleClientId || !googleRequest} />
          {!googleClientId ? <Txt variant="small" style={s.providerHelp}>Configure os Client IDs OAuth do Google para habilitar este acesso.</Txt> : null}
          {appleAvailable ? <AppleAuthentication.AppleAuthenticationButton
            testID="login-apple-button"
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={R.md}
            style={s.appleButton}
            onPress={signInApple}
          /> : null}
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
  remember: { flexDirection: "row", alignItems: "center", gap: S.sm, minHeight: 44, marginTop: S.xs },
  checkbox: { width: 20, height: 20, borderWidth: 1.5, borderColor: c.borderStrong, borderRadius: 5, alignItems: "center", justifyContent: "center" },
  divider: { flexDirection: "row", alignItems: "center", gap: S.sm, marginVertical: S.sm },
  rule: { flex: 1, height: 1, backgroundColor: c.border },
  providerHelp: { textAlign: "center", color: c.onSurfaceSecondary, marginTop: -S.sm },
  appleButton: { width: "100%", height: 48, marginTop: S.sm },
}));
