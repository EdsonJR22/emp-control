import assert from "node:assert/strict";
import test from "node:test";
import {
  buildConsumptionReport,
  consumptionToday,
  ConsumptionInputError,
  getConsumptionPeriod,
  type ConsumptionCatalogItem,
  type ConsumptionEntry,
} from "../lib/consumption.ts";

const today = "2026-10-01";

function catalogItem(
  id = "item-1",
  description = "Arroz branco",
  unit = "Kg",
  commitmentId = "ne-1",
): ConsumptionCatalogItem {
  return { id, description, unit, commitmentId };
}

function entry(
  quantity: number,
  invoiceDate = "2026-09-15",
  commitmentItemId = "item-1",
  invoiceId = "nf-1",
): ConsumptionEntry {
  return { commitmentItemId, invoiceId, invoiceDate, quantity };
}

function report(
  entries: ConsumptionEntry[],
  catalog: ConsumptionCatalogItem[] = [catalogItem()],
  start = "2026-09-01",
  end = "2026-09-30",
) {
  const period = getConsumptionPeriod({ period: "custom", start, end }, today, null);
  return buildConsumptionReport(catalog, entries, period, today, null);
}

function approximately(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} should equal ${expected}`);
}

test("uses the Sao Paulo calendar date around the UTC day boundary", () => {
  assert.equal(consumptionToday(new Date("2026-10-01T02:59:59Z")), "2026-09-30");
  assert.equal(consumptionToday(new Date("2026-10-01T03:00:00Z")), "2026-10-01");
});

test("rolling presets and the default have inclusive day counts", () => {
  assert.deepEqual(getConsumptionPeriod({}, today, null), {
    startDate: "2026-07-04",
    endDate: today,
    days: 90,
  });
  assert.deepEqual(getConsumptionPeriod({ period: "30d" }, today, null), {
    startDate: "2026-09-02",
    endDate: today,
    days: 30,
  });
  assert.equal(getConsumptionPeriod({ period: "180d" }, today, null).days, 180);
  assert.deepEqual(getConsumptionPeriod({ period: "month" }, "2026-09-15", null), {
    startDate: "2026-09-01",
    endDate: "2026-09-15",
    days: 15,
  });
});

test("all history begins on the first invoice and safely handles no past invoices", () => {
  assert.deepEqual(getConsumptionPeriod({ period: "all" }, today, "2026-09-01"), {
    startDate: "2026-09-01",
    endDate: today,
    days: 31,
  });
  for (const firstInvoiceDate of [null, "2026-10-02"]) {
    assert.deepEqual(getConsumptionPeriod({ period: "all" }, today, firstInvoiceDate), {
      startDate: today,
      endDate: today,
      days: 1,
    });
  }
});

test("periods handle leap years, year boundaries and a single day", () => {
  assert.equal(getConsumptionPeriod({
    period: "custom", start: "2024-02-01", end: "2024-02-29",
  }, today, null).days, 29);
  assert.equal(getConsumptionPeriod({
    period: "custom", start: "2025-12-30", end: "2026-01-02",
  }, today, null).days, 4);
  assert.equal(getConsumptionPeriod({
    period: "custom", start: today, end: today,
  }, today, null).days, 1);
});

test("invalid, inverted, missing and future date selections are rejected", () => {
  const invalidSelections = [
    { period: "unsupported" },
    { period: "custom" },
    { period: "custom", start: "2026-02-30", end: "2026-03-01" },
    { period: "custom", start: "2026-2-01", end: "2026-03-01" },
    { period: "custom", start: "2026-09-02", end: "2026-09-01" },
    { period: "custom", start: today, end: "2026-10-02" },
  ];
  for (const selection of invalidSelections) {
    assert.throws(() => getConsumptionPeriod(selection, today, null), ConsumptionInputError);
  }
  assert.throws(() => getConsumptionPeriod({}, "2026-02-30", null));
});

test("thirty days and seven days produce consistent monthly and weekly averages", () => {
  const monthly = report([entry(60)]).items[0];
  assert.equal(monthly.totalQuantity, 60);
  assert.equal(monthly.monthlyAverage, 60);
  assert.equal(monthly.weeklyAverage, 14);

  const weekly = report([entry(14, "2026-09-01")], [catalogItem()], "2026-09-01", "2026-09-07").items[0];
  assert.equal(weekly.monthlyAverage, 60);
  assert.equal(weekly.weeklyAverage, 14);
});

test("days, weeks and months without invoices remain in the average denominator", () => {
  const result = report([entry(61, "2026-08-01")], [catalogItem()], "2026-08-01", "2026-09-30");
  assert.equal(result.period.days, 61);
  assert.equal(result.items[0].monthlyAverage, 30);
  assert.equal(result.items[0].weeklyAverage, 7);
  assert.equal(result.items[0].invoiceCount, 1);
});

test("description case, whitespace and Unicode composition consolidate across commitments", () => {
  const catalog = [
    catalogItem("a", "  Café   torrado ", "Kg", "ne-1"),
    catalogItem("b", "CAFE\u0301 TORRADO", " quilogramas ", "ne-2"),
  ];
  const result = report([
    entry(10, "2026-09-02", "a", "nf-1"),
    entry(20, "2026-09-20", "b", "nf-2"),
  ], catalog);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].description, "Café torrado");
  assert.equal(result.items[0].unit, "Kg");
  assert.equal(result.items[0].totalQuantity, 30);
  assert.equal(result.items[0].commitmentCount, 2);
  assert.equal(result.items[0].invoiceCount, 2);
  assert.equal(result.items[0].lastInvoiceDate, "2026-09-20");
});

test("only known whole-unit aliases consolidate; packaging and distinct units remain separate", () => {
  const units = ["Kg", "quilo", "quilograma", "un", "UND", "unidade", "un 500g", "caixa", "Dz", "dúzia", "l", "litros"];
  const catalog = units.map((unit, index) => catalogItem(`item-${index}`, "Produto", unit));
  const result = report(catalog.map((item) => entry(1, "2026-09-15", item.id)), catalog);
  assert.equal(result.items.length, 6);
  const quantities = Object.fromEntries(result.items.map((item) => [item.unit, item.totalQuantity]));
  assert.deepEqual(quantities, { caixa: 1, Dz: 2, Kg: 3, L: 2, Un: 3, "un 500g": 1 });
});

test("different descriptions and significant accents and punctuation do not merge", () => {
  const catalog = [
    catalogItem("a", "Café"),
    catalogItem("b", "Cafe"),
    catalogItem("c", "Café - torrado"),
    catalogItem("d", "Café torrado"),
  ];
  const result = report([], catalog);
  assert.equal(result.items.length, 4);
});

test("multiple equivalent lines in one invoice sum quantities but count the invoice once", () => {
  const catalog = [catalogItem("a"), catalogItem("b", "ARROZ BRANCO"), catalogItem("c", "Feijão")];
  const result = report([
    entry(2, "2026-09-15", "a", "nf-1"),
    entry(3, "2026-09-15", "b", "nf-1"),
    entry(4, "2026-09-15", "c", "nf-1"),
    entry(5, "2026-09-16", "a", "nf-2"),
  ], catalog);
  const rice = result.items.find((item) => item.description === "Arroz branco")!;
  assert.equal(rice.totalQuantity, 10);
  assert.equal(rice.invoiceCount, 2);
  assert.equal(rice.commitmentCount, 1);
  assert.equal(result.summary.invoiceCount, 2);
  assert.equal(result.summary.commitmentCount, 1);
  assert.equal(result.summary.consumedItemCount, 2);
});

test("date boundaries are inclusive and invoice dates outside the period are excluded", () => {
  const result = report([
    entry(1, "2026-08-31", "item-1", "before"),
    entry(2, "2026-09-01", "item-1", "first"),
    entry(3, "2026-09-30", "item-1", "last"),
    entry(4, "2026-10-01", "item-1", "after"),
    entry(5, "2027-01-01", "item-1", "future"),
  ]);
  assert.equal(result.items[0].totalQuantity, 5);
  assert.equal(result.items[0].invoiceCount, 2);
  assert.equal(result.items[0].lastInvoiceDate, "2026-09-30");
});

test("catalog items without delivered quantities remain visible with zero consumption", () => {
  const result = report([entry(0)], [catalogItem(), catalogItem("unused", "Feijão", "Kg", "ne-2")]);
  assert.deepEqual(result.summary, { itemCount: 2, consumedItemCount: 0, invoiceCount: 0, commitmentCount: 0 });
  for (const item of result.items) {
    assert.equal(item.totalQuantity, 0);
    assert.equal(item.monthlyAverage, 0);
    assert.equal(item.weeklyAverage, 0);
    assert.equal(item.lastInvoiceDate, null);
    assert.equal(item.invoiceCount, 0);
  }
  assert.deepEqual(report([], []).items, []);
});

test("fractional quantities retain their precision until presentation", () => {
  const item = report([entry(0.1), entry(0.2)]).items[0];
  approximately(item.totalQuantity, 0.3);
  approximately(item.monthlyAverage, 0.3);
  approximately(item.weeklyAverage, 0.07);
  const small = report([entry(0.001)]).items[0];
  assert.ok(small.weeklyAverage > 0);
  approximately(small.weeklyAverage, 0.001 / 30 * 7);
});

test("negative and non-finite invoice quantities fail instead of corrupting totals", () => {
  for (const quantity of [-1, NaN, Infinity, -Infinity]) {
    assert.throws(() => report([entry(quantity)]), /Quantidade/);
  }
  assert.throws(() => report([entry(1, "2026-09-15", "missing-item")]), /cadastro/);
});

test("invoice corrections, date changes and deletion are reflected on each rebuild", () => {
  assert.equal(report([entry(20)]).items[0].totalQuantity, 20);
  const corrected = report([entry(8)]);
  assert.equal(corrected.items[0].totalQuantity, 8);
  approximately(corrected.items[0].weeklyAverage, 8 / 30 * 7);
  assert.equal(report([entry(8, "2026-08-31")]).items[0].totalQuantity, 0);
  const deleted = report([]);
  assert.equal(deleted.items[0].totalQuantity, 0);
  assert.equal(deleted.summary.invoiceCount, 0);
  assert.equal(deleted.items[0].lastInvoiceDate, null);
});
