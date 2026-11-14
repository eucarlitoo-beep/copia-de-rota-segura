import type { ThemeColors } from "@/src/theme";

export const F = {
  regular: "PJS-Regular",
  medium: "PJS-Medium",
  semibold: "PJS-SemiBold",
  bold: "PJS-Bold",
  black: "PJS-ExtraBold",
};

export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };
export const R = { sm: 8, md: 16, lg: 24, pill: 999 };

export const CATEGORIES: { key: string; label: string; icon: string; color: keyof ThemeColors }[] = [
  { key: "assalto", label: "Assalto", icon: "warning", color: "error" },
  { key: "roubo_veiculo", label: "Roubo de veículo", icon: "car", color: "error" },
  { key: "via_perigosa", label: "Via perigosa", icon: "alert-circle", color: "warning" },
  { key: "acidente", label: "Acidente", icon: "medkit", color: "warning" },
  { key: "alagamento", label: "Alagamento", icon: "water", color: "info" },
  { key: "sem_iluminacao", label: "Sem iluminação", icon: "bulb", color: "brand" },
  { key: "outro", label: "Outro", icon: "ellipsis-horizontal-circle", color: "muted" },
];
export const catOf = (k: string) => CATEGORIES.find((c) => c.key === k) ?? CATEGORIES[CATEGORIES.length - 1];

export const EMERGENCY = [
  { number: "190", label: "Polícia Militar", icon: "shield", action: "ligacao_190" },
  { number: "192", label: "SAMU", icon: "medkit", action: "ligacao_192" },
  { number: "193", label: "Bombeiros", icon: "flame", action: "ligacao_193" },
] as const;

export const DRIVER_TYPES = [
  { key: "aplicativo", label: "Aplicativo" },
  { key: "taxi", label: "Táxi" },
  { key: "profissional", label: "Profissional" },
] as const;

export const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Telefone -> formato internacional sem símbolos (Brasil = 55)
export const intlPhone = (p: string) => {
  const d = p.replace(/\D/g, "");
  return d.length <= 11 ? `55${d}` : d;
};
