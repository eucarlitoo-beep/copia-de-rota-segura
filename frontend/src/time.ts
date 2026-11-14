import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export const timeAgo = (iso: string) => formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR });
export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
