import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { createContext, PropsWithChildren, ReactNode, useCallback, useContext, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  StyleProp,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { F, R, S } from "@/src/constants";
import { makeStyles, useTheme } from "@/src/theme";

export const Icon = Ionicons;

export function Txt({
  children,
  style,
  variant = "body",
  testID,
  numberOfLines,
}: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
  variant?: "title" | "h2" | "body" | "small" | "label";
  testID?: string;
  numberOfLines?: number;
}) {
  const s = useStyles();
  return (
    <Text testID={testID} numberOfLines={numberOfLines} style={[s[variant], style]}>
      {children}
    </Text>
  );
}

type BtnProps = {
  label: string;
  onPress: () => void;
  variant?: "primary" | "navy" | "outline" | "danger" | "ghost";
  icon?: string;
  loading?: boolean;
  disabled?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
};

export function Btn({ label, onPress, variant = "primary", icon, loading, disabled, testID, style, small }: BtnProps) {
  const s = useStyles();
  const { colors } = useTheme();
  const bg = { primary: colors.brandPrimary, navy: colors.brand, outline: colors.surface, danger: colors.error, ghost: "transparent" }[variant];
  const fg = { primary: colors.onBrandPrimary, navy: colors.onBrand, outline: colors.brand, danger: colors.onError, ghost: colors.brand }[variant];
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        s.btn,
        small && s.btnSmall,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
        variant === "outline" && s.btnOutline,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Icon name={icon as any} size={small ? 18 : 22} color={fg} /> : null}
          <Text style={[s.btnText, small && s.btnTextSmall, { color: fg }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Card({ children, style, testID }: PropsWithChildren<{ style?: StyleProp<ViewStyle>; testID?: string }>) {
  const s = useStyles();
  return (
    <View testID={testID} style={[s.card, style]}>
      {children}
    </View>
  );
}

export function ScreenHeader({ title, right }: { title: string; right?: ReactNode }) {
  const s = useStyles();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  return (
    <View style={[s.header, { paddingTop: insets.top + S.sm }]}>
      <Pressable
        testID="header-back-button"
        accessibilityLabel="Voltar"
        hitSlop={12}
        onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        style={s.headerBack}
      >
        <Icon name="chevron-back" size={26} color={colors.onBrand} />
      </Pressable>
      <Text style={s.headerTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={s.headerRight}>{right}</View>
    </View>
  );
}

export function Banner({ text, kind = "warning", testID, action }: { text: string; kind?: "warning" | "error" | "info" | "success"; testID?: string; action?: ReactNode }) {
  const s = useStyles();
  const { colors } = useTheme();
  const icon = { warning: "cloud-offline", error: "alert-circle", info: "information-circle", success: "checkmark-circle" }[kind];
  return (
    <View testID={testID} style={[s.banner, { backgroundColor: colors[kind] }]}>
      <Icon name={icon as any} size={20} color={colors.onWarning} />
      <Text style={s.bannerText}>{text}</Text>
      {action}
    </View>
  );
}

export function OfflineBanner({ online }: { online: boolean }) {
  if (online) return null;
  return <Banner testID="offline-banner" text="Sem internet. Ligações de emergência e SMS continuam disponíveis." />;
}

export function Field({ label, error, ...props }: TextInputProps & { label: string; error?: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  const [focus, setFocus] = useState(false);
  return (
    <View style={s.fieldWrap}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        {...props}
        style={[s.input, focus && { borderColor: colors.brand }, props.multiline && s.inputMulti, props.style]}
      />
      {error ? <Text style={s.fieldError}>{error}</Text> : null}
    </View>
  );
}

export function Sheet({ visible, onClose, children, testID }: PropsWithChildren<{ visible: boolean; onClose: () => void; testID?: string }>) {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={s.scrim} onPress={onClose} testID={testID ? `${testID}-backdrop` : undefined} />
      <View testID={testID} style={[s.sheet, { paddingBottom: insets.bottom + S.lg }]}>
        <View style={s.grabber} />
        {children}
      </View>
    </Modal>
  );
}

export function ConfirmSheet({
  visible, title, message, confirmLabel, onConfirm, onClose, danger, loading, testID,
}: {
  visible: boolean; title: string; message: string; confirmLabel: string; onConfirm: () => void; onClose: () => void; danger?: boolean; loading?: boolean; testID?: string;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} testID={testID}>
      <Txt variant="h2">{title}</Txt>
      <Txt style={{ marginTop: S.sm, marginBottom: S.xl }}>{message}</Txt>
      <Btn testID={`${testID}-confirm`} label={confirmLabel} variant={danger ? "danger" : "primary"} onPress={onConfirm} loading={loading} />
      <Btn testID={`${testID}-cancel`} label="Cancelar" variant="ghost" onPress={onClose} style={{ marginTop: S.sm }} />
    </Sheet>
  );
}

export function PermissionCard({
  title, text, canAskAgain, onAllow, testID,
}: { title: string; text: string; canAskAgain: boolean; onAllow: () => void; testID?: string }) {
  return (
    <Card testID={testID}>
      <Txt variant="h2">{title}</Txt>
      <Txt style={{ marginVertical: S.sm }}>{text}</Txt>
      {canAskAgain ? (
        <Btn testID={`${testID}-allow`} label="Permitir localização" icon="location" onPress={onAllow} />
      ) : (
        <>
          <Txt variant="small" style={{ marginBottom: S.sm }}>
            A permissão foi negada. Ative manualmente nas configurações do aparelho.
          </Txt>
          <Btn testID={`${testID}-settings`} label="Abrir Configurações" icon="settings" variant="navy" onPress={() => Linking.openSettings()} />
        </>
      )}
    </Card>
  );
}

export function Empty({ icon, title, text, testID }: { icon: string; title: string; text?: string; testID?: string }) {
  const { colors } = useTheme();
  return (
    <View testID={testID} style={{ alignItems: "center", padding: S.xxl, gap: S.sm }}>
      <Icon name={icon as any} size={48} color={colors.muted} />
      <Txt variant="h2" style={{ textAlign: "center" }}>{title}</Txt>
      {text ? <Txt style={{ textAlign: "center" }}>{text}</Txt> : null}
    </View>
  );
}

// ---------------- Toast
type ToastKind = "success" | "error" | "info";
const ToastCtx = createContext<(msg: string, kind?: ToastKind) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: PropsWithChildren) {
  const [toast, setToast] = useState<{ msg: string; kind: ToastKind } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const s = useStyles();
  const show = useCallback((msg: string, kind: ToastKind = "info") => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ msg, kind });
    timer.current = setTimeout(() => setToast(null), 3500);
  }, []);
  const bg = toast ? { success: colors.success, error: colors.error, info: colors.surfaceInverse }[toast.kind] : colors.surfaceInverse;
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast ? (
        <Animated.View entering={FadeInUp} exiting={FadeOutUp} pointerEvents="none" style={[s.toast, { top: insets.top + S.sm, backgroundColor: bg }]}>
          <Text testID="toast-message" style={s.toastText}>{toast.msg}</Text>
        </Animated.View>
      ) : null}
    </ToastCtx.Provider>
  );
}

const useStyles = makeStyles((c) => ({
  title: { fontFamily: F.black, fontSize: 28, color: c.brand, letterSpacing: -0.5 },
  h2: { fontFamily: F.bold, fontSize: 20, color: c.onSurface },
  body: { fontFamily: F.regular, fontSize: 16, color: c.onSurfaceSecondary, lineHeight: 23 },
  small: { fontFamily: F.medium, fontSize: 13, color: c.muted, lineHeight: 18 },
  label: { fontFamily: F.semibold, fontSize: 14, color: c.onSurface, marginBottom: S.xs },
  btn: { minHeight: 56, borderRadius: R.md, paddingHorizontal: S.xl, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: S.sm },
  btnSmall: { minHeight: 44, paddingHorizontal: S.lg, borderRadius: R.sm + 4 },
  btnOutline: { borderWidth: 1.5, borderColor: c.brand },
  btnText: { fontFamily: F.bold, fontSize: 17 },
  btnTextSmall: { fontSize: 14 },
  card: { backgroundColor: c.surface, borderRadius: R.md + 4, padding: S.lg, borderWidth: 1, borderColor: c.border, shadowColor: c.brand, shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  header: { backgroundColor: c.brand, flexDirection: "row", alignItems: "center", paddingHorizontal: S.sm, paddingBottom: S.md },
  headerBack: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, fontFamily: F.bold, fontSize: 19, color: c.onBrand, marginLeft: S.xs },
  headerRight: { minWidth: 44, alignItems: "flex-end", paddingRight: S.sm },
  banner: { flexDirection: "row", alignItems: "center", gap: S.sm, paddingVertical: S.md, paddingHorizontal: S.lg, borderRadius: R.md },
  bannerText: { flex: 1, fontFamily: F.semibold, fontSize: 14, color: c.onWarning },
  fieldWrap: { marginBottom: S.lg },
  input: { minHeight: 56, borderRadius: R.md, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surfaceSecondary, paddingHorizontal: S.lg, fontFamily: F.medium, fontSize: 16, color: c.onSurface },
  inputMulti: { minHeight: 110, paddingTop: S.md, textAlignVertical: "top" },
  fieldError: { fontFamily: F.medium, fontSize: 13, color: c.error, marginTop: S.xs },
  scrim: { flex: 1, backgroundColor: c.scrim },
  sheet: { backgroundColor: c.surface, borderTopLeftRadius: R.lg, borderTopRightRadius: R.lg, paddingHorizontal: S.xl, paddingTop: S.md, maxHeight: "90%" },
  grabber: { alignSelf: "center", width: 44, height: 5, borderRadius: 3, backgroundColor: c.borderStrong, marginBottom: S.lg },
  toast: { position: "absolute", left: S.lg, right: S.lg, borderRadius: R.md, padding: S.lg, zIndex: 999, elevation: 10 },
  toastText: { fontFamily: F.semibold, fontSize: 15, color: c.onSurfaceInverse },
}));
