import { useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, errMsg } from "@/src/api";
import { F, S } from "@/src/constants";
import { Btn, Field, ScreenHeader, Txt } from "@/src/components/ui";
import { makeStyles } from "@/src/theme";

export default function ForgotPassword() {
  const s = useStyles();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async () => {
    const address = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(address)) return setError("Digite um endereço de e-mail válido.");
    setLoading(true); setError(""); setMessage("");
    try {
      const result = await api<{ message: string }>("/auth/password-reset/request", { method: "POST", body: { email: address } });
      setMessage(result.message);
    } catch (e) { setError(errMsg(e)); }
    finally { setLoading(false); }
  };
  return <View style={s.root}><ScreenHeader title="Recuperar senha" /><KeyboardAwareScrollView contentContainerStyle={{ padding: S.xl, paddingBottom: insets.bottom + S.xl, gap: S.md }} keyboardShouldPersistTaps="handled">
    <Txt>Informe o e-mail da sua conta. Se ele estiver cadastrado, enviaremos um link de uso único que expira em 30 minutos.</Txt>
    <Field testID="forgot-email-input" label="E-mail" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder="seu@email.com" />
    {message ? <Txt testID="forgot-success" style={s.success}>{message}</Txt> : null}
    {error ? <Txt testID="forgot-error" style={s.error}>{error}</Txt> : null}
    <Btn testID="forgot-submit-button" label="Enviar link de recuperação" onPress={submit} loading={loading} />
    <Btn label="Voltar ao login" variant="outline" onPress={() => router.replace("/login")} />
  </KeyboardAwareScrollView></View>;
}

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface }, success: { color: c.success, fontFamily: F.semibold }, error: { color: c.error, fontFamily: F.semibold } }));
