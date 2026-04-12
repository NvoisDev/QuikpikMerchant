import { useAuth } from "@/hooks/useAuth";
import { formatCurrency } from "@/lib/currencies";

export function useCurrency() {
  const { user } = useAuth();
  const currency: string = (user as any)?.preferredCurrency || 'GBP';

  const formatMoney = (amount: number | string): string =>
    formatCurrency(amount, currency);

  return { currency, formatMoney };
}
