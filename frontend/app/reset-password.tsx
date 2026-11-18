import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, errMsg } from "@/src/api";
import { F, S } from "@/src/constants";
import { Btn, Field, ScreenHeader, Txt } from "@/src/components/ui";
import { makeStyles } from "@/src/theme";

export default function ResetPassword() {
  const s = useStyles();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async () => {
    if (!token || Array.isArray(token)) return setError("Link inválido. Solicite uma nova recuperação.");
    if (password.length < 8) return setError("A nova senha precisa ter pelo menos 8 caracteres.");
    if (password !== confirmation) return setError("As senhas não correspondem.");
    setLoading(true); setError("");
    try {
      await api("/auth/password-reset/confirm", { method: "POST", body: { token, password } });
      router.replace("/login");
    } catch (e) { setError(errMsg(e)); }
    finally { setLoading(false); }
  };
  return <View style={s.root}><ScreenHeader title="Criar nova senha" /><KeyboardAwareScrollView contentContainerStyle={{ padding: S.xl, paddingBottom: insets.bottom + S.xl, gap: S.md }} keyboardShouldPersistTaps="handled">
    <Field testID="reset-password-input" label="Nova senha" value={password} onChangeText={setPassword} secureTextEntry placeholder="Mínimo de 8 caracteres" />
    <Field testID="reset-confirm-password-input" label="Confirme a nova senha" value={confirmation} onChangeText={setConfirmation} secureTextEntry placeholder="Digite novamente" onSubmitEditing={submit} />
    {error ? <Txt testID="reset-password-error" style={s.error}>{error}</Txt> : null}
    <Btn testID="reset-password-submit" label="Salvar nova senha" onPress={submit} loading={loading} />
  </KeyboardAwareScrollView></View>;
}

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface }, error: { color: c.error, fontFamily: F.semibold } }));
