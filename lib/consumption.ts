import type { ConsumptionData, ConsumptionPeriod } from "./types.ts";

const DAY_MS = 86_400_000;

export class ConsumptionInputError extends Error {}

export type ConsumptionSelection = {
  period?: string;
  start?: string;
  end?: string;
};

export type ConsumptionCatalogItem = {
  id: string;
  commitmentId: string;
  description: string;
  unit: string;
};

export type ConsumptionEntry = {
  commitmentItemId: string;
  invoiceId: string;
  invoiceDate: string;
  quantity: number;
};

export function consumptionToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((value) => value.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function dateMillis(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  const millis = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(millis) && new Date(millis).toISOString().slice(0, 10) === value
    ? millis
    : NaN;
}

export function getConsumptionPeriod(
  selection: ConsumptionSelection,
  today: string,
  firstInvoiceDate: string | null,
): ConsumptionPeriod {
  const todayMillis = dateMillis(today);
  if (!Number.isFinite(todayMillis)) throw new Error("Data de referência inválida.");
  let startDate: string;
  let endDate = today;
  const preset = selection.period ?? "90d";
  if (preset === "custom") {
    startDate = selection.start ?? "";
    endDate = selection.end ?? "";
  } else if (preset === "all") {
    startDate = firstInvoiceDate && firstInvoiceDate <= today ? firstInvoiceDate : today;
  } else if (preset === "month") {
    startDate = `${today.slice(0, 7)}-01`;
  } else if (["30d", "90d", "180d"].includes(preset)) {
    const days = Number(preset.slice(0, -1));
    startDate = new Date(todayMillis - (days - 1) * DAY_MS).toISOString().slice(0, 10);
  } else {
    throw new ConsumptionInputError("Escolha um período válido.");
  }

  const startMillis = dateMillis(startDate);
  const endMillis = dateMillis(endDate);
  if (!Number.isFinite(startMillis) || !Number.isFinite(endMillis)) {
    throw new ConsumptionInputError("Informe datas válidas para o período.");
  }
  if (startMillis > endMillis) {
    throw new ConsumptionInputError("A data inicial deve ser anterior ou igual à data final.");
  }
  if (endMillis > todayMillis) {
    throw new ConsumptionInputError("O período não pode incluir datas futuras.");
  }
  return { startDate, endDate, days: Math.round((endMillis - startMillis) / DAY_MS) + 1 };
}

function cleanText(value: string) {
  return value.normalize("NFC").trim().replace(/\s+/g, " ");
}

function normalizeUnit(value: string) {
  const unit = cleanText(value);
  const key = unit.toLocaleLowerCase("pt-BR");
  if (["kg", "quilo", "quilos", "quilograma", "quilogramas"].includes(key)) return "Kg";
  if (["dz", "duzia", "duzias", "dúzia", "dúzias"].includes(key)) return "Dz";
  if (["un", "und", "unidade", "unidades"].includes(key)) return "Un";
  if (["l", "litro", "litros"].includes(key)) return "L";
  return unit;
}

export function buildConsumptionReport(
  catalog: ConsumptionCatalogItem[],
  entries: ConsumptionEntry[],
  period: ConsumptionPeriod,
  today: string,
  firstInvoiceDate: string | null,
): ConsumptionData {
  const groups = new Map<string, {
    description: string;
    unit: string;
    quantity: number;
    invoices: Set<string>;
    commitments: Set<string>;
    lastInvoiceDate: string | null;
  }>();
  const catalogIndex = new Map<string, { key: string; commitmentId: string }>();
  for (const item of catalog) {
    const description = cleanText(item.description);
    const unit = normalizeUnit(item.unit);
    const key = JSON.stringify([description.toLocaleLowerCase("pt-BR"), unit.toLocaleLowerCase("pt-BR")]);
    if (!groups.has(key)) {
      groups.set(key, {
        description, unit, quantity: 0, invoices: new Set(), commitments: new Set(), lastInvoiceDate: null,
      });
    }
    catalogIndex.set(item.id, { key, commitmentId: item.commitmentId });
  }
  const invoices = new Set<string>();
  const commitments = new Set<string>();
  for (const entry of entries) {
    if (entry.invoiceDate < period.startDate || entry.invoiceDate > period.endDate) continue;
    const source = catalogIndex.get(entry.commitmentItemId);
    if (!source) throw new Error("Item de nota fiscal sem cadastro correspondente.");
    if (!Number.isFinite(entry.quantity) || entry.quantity < 0) {
      throw new Error("Quantidade inválida no histórico de notas fiscais.");
    }
    if (entry.quantity === 0) continue;
    const group = groups.get(source.key)!;
    group.quantity += entry.quantity;
    group.invoices.add(entry.invoiceId);
    group.commitments.add(source.commitmentId);
    if (!group.lastInvoiceDate || entry.invoiceDate > group.lastInvoiceDate) {
      group.lastInvoiceDate = entry.invoiceDate;
    }
    invoices.add(entry.invoiceId);
    commitments.add(source.commitmentId);
  }

  const items = [...groups.entries()].map(([key, group]) => ({
    key,
    description: group.description,
    unit: group.unit,
    // Only presentation is rounded; averages use the complete sum.
    totalQuantity: group.quantity,
    monthlyAverage: (group.quantity / period.days) * 30,
    weeklyAverage: (group.quantity / period.days) * 7,
    invoiceCount: group.invoices.size,
    commitmentCount: group.commitments.size,
    lastInvoiceDate: group.lastInvoiceDate,
  })).sort((a, b) => a.description.localeCompare(b.description, "pt-BR") || a.unit.localeCompare(b.unit, "pt-BR"));
  return {
    today, firstInvoiceDate, period, items,
    summary: {
      itemCount: items.length,
      consumedItemCount: items.filter((item) => item.totalQuantity > 0).length,
      invoiceCount: invoices.size,
      commitmentCount: commitments.size,
    },
  };
}
