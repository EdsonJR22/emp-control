import { env } from "cloudflare:workers";
import seedData from "./seed-data.json";
import type {
  AnnulmentItemDetail,
  ArchivedCommitmentsData,
  CommitmentDetail,
  CommitmentStatus,
  CreateAnnulmentPayload,
  CreateCommitmentPayload,
  CreateInvoicePayload,
  CreateOrderPayload,
  CreateReinforcementPayload,
  DashboardCommitment,
  DashboardData,
  OrderDetail,
  OrderStatus,
  ReinforcementItemDetail,
} from "../lib/types";

type SeedCommitment = {
  id: string;
  number: string;
  supplier: string;
  issueDate: string;
  status: CommitmentStatus;
  notes: string;
  totalCents: number;
  items: Array<{
    id: string;
    lineNumber: number;
    description: string;
    unit: string;
    contractedQuantity: number;
    unitPriceCents: number;
  }>;
  orders: Array<{
    id: string;
    reference: string;
    orderDate: string;
    status: OrderStatus;
    notes: string;
    totalCents: number;
    calculatedTotalCents: number;
    items: Array<{
      id: string;
      commitmentItemId: string;
      quantity: number;
      unitPriceCents: number;
    }>;
  }>;
};

type DataRow = Record<string, number | string | null>;

export class DomainError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
    public readonly code = "INVALID_REQUEST",
    public readonly details: Record<string, number | string> = {},
  ) {
    super(message);
  }
}

let initialization: Promise<void> | null = null;

function getD1() {
  if (!env.DB) {
    throw new Error(
      "O banco de dados do app ainda não está disponível. Verifique a vinculação D1.",
    );
  }
  return env.DB;
}

async function initializeDatabase() {
  const db = getD1();
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS commitments (
      id TEXT PRIMARY KEY NOT NULL,
      number TEXT NOT NULL UNIQUE,
      supplier TEXT NOT NULL,
      issue_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ativa',
      notes TEXT NOT NULL DEFAULT '',
      total_cents INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      created_by TEXT NOT NULL DEFAULT ''
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS commitment_items (
      id TEXT PRIMARY KEY NOT NULL,
      commitment_id TEXT NOT NULL REFERENCES commitments(id) ON DELETE CASCADE,
      line_number INTEGER NOT NULL,
      description TEXT NOT NULL,
      unit TEXT NOT NULL,
      contracted_quantity REAL NOT NULL,
      unit_price_cents INTEGER NOT NULL,
      UNIQUE(commitment_id, line_number)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY NOT NULL,
      commitment_id TEXT NOT NULL REFERENCES commitments(id) ON DELETE CASCADE,
      reference TEXT NOT NULL,
      order_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'rascunho',
      notes TEXT NOT NULL DEFAULT '',
      calculated_total_cents INTEGER NOT NULL,
      total_cents INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      created_by TEXT NOT NULL DEFAULT ''
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY NOT NULL,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      commitment_item_id TEXT NOT NULL REFERENCES commitment_items(id) ON DELETE CASCADE,
      quantity REAL NOT NULL,
      unit_price_cents INTEGER NOT NULL,
      UNIQUE(order_id, commitment_item_id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY NOT NULL,
      order_id TEXT NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
      number TEXT NOT NULL,
      invoice_date TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      calculated_total_cents INTEGER NOT NULL,
      total_cents INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      created_by TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL DEFAULT ''
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS invoice_items (
      id TEXT PRIMARY KEY NOT NULL,
      invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      commitment_item_id TEXT NOT NULL REFERENCES commitment_items(id) ON DELETE CASCADE,
      quantity REAL NOT NULL,
      unit_price_cents INTEGER NOT NULL,
      UNIQUE(invoice_id, commitment_item_id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS commitment_archives (
      commitment_id TEXT PRIMARY KEY NOT NULL REFERENCES commitments(id) ON DELETE CASCADE,
      archived_at TEXT NOT NULL,
      archived_by TEXT NOT NULL DEFAULT ''
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS commitment_reinforcements (
      id TEXT PRIMARY KEY NOT NULL,
      commitment_id TEXT NOT NULL REFERENCES commitments(id) ON DELETE CASCADE,
      reference TEXT NOT NULL,
      reinforcement_date TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      total_cents INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      created_by TEXT NOT NULL DEFAULT ''
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS commitment_reinforcement_items (
      id TEXT PRIMARY KEY NOT NULL,
      reinforcement_id TEXT NOT NULL REFERENCES commitment_reinforcements(id) ON DELETE CASCADE,
      commitment_item_id TEXT NOT NULL REFERENCES commitment_items(id) ON DELETE CASCADE,
      added_quantity REAL NOT NULL,
      unit_price_cents INTEGER NOT NULL,
      added_total_cents INTEGER NOT NULL,
      UNIQUE(reinforcement_id, commitment_item_id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS commitment_annulments (
      id TEXT PRIMARY KEY NOT NULL,
      commitment_id TEXT NOT NULL REFERENCES commitments(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      reference TEXT NOT NULL,
      annulment_date TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      calculated_total_cents INTEGER NOT NULL,
      total_cents INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      created_by TEXT NOT NULL DEFAULT ''
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS commitment_annulment_items (
      id TEXT PRIMARY KEY NOT NULL,
      annulment_id TEXT NOT NULL REFERENCES commitment_annulments(id) ON DELETE CASCADE,
      commitment_item_id TEXT NOT NULL REFERENCES commitment_items(id) ON DELETE CASCADE,
      annulled_quantity REAL NOT NULL,
      unit_price_cents INTEGER NOT NULL,
      annulled_total_cents INTEGER NOT NULL,
      UNIQUE(annulment_id, commitment_item_id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    )`),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS commitment_items_commitment_idx ON commitment_items(commitment_id)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS orders_commitment_idx ON orders(commitment_id)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items(order_id)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS order_items_commitment_item_idx ON order_items(commitment_item_id)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS invoices_date_idx ON invoices(invoice_date)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS invoice_items_invoice_idx ON invoice_items(invoice_id)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS invoice_items_commitment_item_idx ON invoice_items(commitment_item_id)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS commitment_archives_date_idx ON commitment_archives(archived_at)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS commitment_reinforcements_commitment_idx ON commitment_reinforcements(commitment_id)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS commitment_reinforcements_date_idx ON commitment_reinforcements(reinforcement_date)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS commitment_reinforcement_items_reinforcement_idx ON commitment_reinforcement_items(reinforcement_id)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS commitment_reinforcement_items_commitment_item_idx ON commitment_reinforcement_items(commitment_item_id)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS commitment_annulments_commitment_idx ON commitment_annulments(commitment_id)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS commitment_annulments_date_idx ON commitment_annulments(annulment_date)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS commitment_annulment_items_annulment_idx ON commitment_annulment_items(annulment_id)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS commitment_annulment_items_commitment_item_idx ON commitment_annulment_items(commitment_item_id)",
    ),
  ]);

  const marker = await db
    .prepare("SELECT value FROM app_meta WHERE key = ?")
    .bind("spreadsheet_seed_v1")
    .first<{ value: string }>();
  if (!marker) {
    const statements = [];
    for (const commitment of seedData as SeedCommitment[]) {
    statements.push(
      db
        .prepare(`INSERT OR IGNORE INTO commitments
          (id, number, supplier, issue_date, status, notes, total_cents, created_at, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          commitment.id,
          commitment.number,
          commitment.supplier,
          commitment.issueDate,
          commitment.status,
          commitment.notes,
          commitment.totalCents,
          `${commitment.issueDate}T12:00:00.000Z`,
          "Importação da planilha",
        ),
    );

    for (const item of commitment.items) {
      statements.push(
        db
          .prepare(`INSERT OR IGNORE INTO commitment_items
            (id, commitment_id, line_number, description, unit, contracted_quantity, unit_price_cents)
            VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .bind(
            item.id,
            commitment.id,
            item.lineNumber,
            item.description,
            item.unit,
            item.contractedQuantity,
            item.unitPriceCents,
          ),
      );
    }

    for (const order of commitment.orders) {
      const adjusted = order.totalCents !== order.calculatedTotalCents;
      const note = adjusted
        ? "Valor da NF informado na planilha difere do cálculo pelos preços da NE."
        : order.notes;
      statements.push(
        db
          .prepare(`INSERT OR IGNORE INTO orders
            (id, commitment_id, reference, order_date, status, notes, calculated_total_cents, total_cents, created_at, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(
            order.id,
            commitment.id,
            order.reference,
            order.orderDate,
            order.status,
            note,
            order.calculatedTotalCents,
            order.totalCents,
            `${order.orderDate}T12:00:00.000Z`,
            "Importação da planilha",
          ),
      );
      for (const item of order.items) {
        statements.push(
          db
            .prepare(`INSERT OR IGNORE INTO order_items
              (id, order_id, commitment_item_id, quantity, unit_price_cents)
              VALUES (?, ?, ?, ?, ?)`)
            .bind(
              item.id,
              order.id,
              item.commitmentItemId,
              item.quantity,
              item.unitPriceCents,
            ),
        );
      }
    }
    }

    for (let start = 0; start < statements.length; start += 60) {
      await db.batch(statements.slice(start, start + 60));
    }
    await db
      .prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)")
      .bind("spreadsheet_seed_v1", new Date().toISOString())
      .run();
  }

  const invoiceMarker = await db
    .prepare("SELECT value FROM app_meta WHERE key = ?")
    .bind("invoice_backfill_v1")
    .first<{ value: string }>();
  if (!invoiceMarker) {
    const legacyOrders = await db
      .prepare(`SELECT o.*
        FROM orders o
        LEFT JOIN invoices i ON i.order_id = o.id
        WHERE o.status = 'faturado' AND i.id IS NULL`)
      .all<DataRow>();

    for (const order of legacyOrders.results) {
      const orderId = String(order.id);
      const invoiceId = `legacy-invoice-${orderId}`;
      const orderItems = await db
        .prepare(`SELECT id, commitment_item_id, quantity, unit_price_cents
          FROM order_items WHERE order_id = ?`)
        .bind(orderId)
        .all<DataRow>();
      const reference = String(order.reference ?? "Nota fiscal importada");
      const timestamp = String(order.created_at ?? new Date().toISOString());
      await db.batch([
        db
          .prepare(`INSERT OR IGNORE INTO invoices
            (id, order_id, number, invoice_date, notes, calculated_total_cents, total_cents, created_at, created_by, updated_at, updated_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(
            invoiceId,
            orderId,
            reference.replace(/^NF\s*/i, "") || reference,
            String(order.order_date),
            String(order.notes ?? ""),
            asNumber(order.calculated_total_cents),
            asNumber(order.total_cents),
            timestamp,
            String(order.created_by ?? "Importação da planilha"),
            timestamp,
            String(order.created_by ?? "Importação da planilha"),
          ),
        ...orderItems.results.map((item) =>
          db
            .prepare(`INSERT OR IGNORE INTO invoice_items
              (id, invoice_id, commitment_item_id, quantity, unit_price_cents)
              VALUES (?, ?, ?, ?, ?)`)
            .bind(
              `legacy-invoice-item-${String(item.id)}`,
              invoiceId,
              String(item.commitment_item_id),
              asNumber(item.quantity),
              asNumber(item.unit_price_cents),
            ),
        ),
      ]);
    }

    await db
      .prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)")
      .bind("invoice_backfill_v1", new Date().toISOString())
      .run();
  }
}

async function ensureDatabase() {
  if (!initialization) {
    initialization = initializeDatabase().catch((error) => {
      initialization = null;
      throw error;
    });
  }
  await initialization;
}

const asNumber = (value: unknown) => Number(value ?? 0);

function mapDashboardCommitments(rows: DataRow[]): DashboardCommitment[] {
  return rows.map((row) => {
    const totalCents = asNumber(row.total_cents);
    const orderedCents = asNumber(row.ordered_cents);
    return {
      id: String(row.id),
      number: String(row.number),
      supplier: String(row.supplier),
      issueDate: String(row.issue_date),
      status: String(row.status) as CommitmentStatus,
      totalCents,
      orderedCents,
      balanceCents: totalCents - orderedCents,
      orderCount: asNumber(row.order_count),
      itemCount: asNumber(row.item_count),
      alertCount: asNumber(row.alert_count),
    };
  });
}

async function getCommitmentRows(archived: boolean) {
  await ensureDatabase();
  const db = getD1();
  const archiveFilter = archived ? "IS NOT NULL" : "IS NULL";
  const orderBy = archived
    ? "ca.archived_at DESC, c.issue_date DESC, c.number DESC"
    : "CASE c.status WHEN 'ativa' THEN 0 WHEN 'suspensa' THEN 1 ELSE 2 END, c.issue_date DESC, c.number DESC";
  return db
    .prepare(`SELECT
      c.id,
      c.number,
      c.supplier,
      c.issue_date,
      c.status,
      c.total_cents,
      COALESCE(order_totals.ordered_cents, 0) AS ordered_cents,
      COALESCE(order_totals.order_count, 0) AS order_count,
      COALESCE(item_totals.item_count, 0) AS item_count,
      COALESCE(alerts.alert_count, 0) AS alert_count
    FROM commitments c
    LEFT JOIN commitment_archives ca ON ca.commitment_id = c.id
    LEFT JOIN (
      SELECT
        o.commitment_id,
        SUM(COALESCE(i.total_cents, o.total_cents)) AS ordered_cents,
        COUNT(*) AS order_count
      FROM orders o
      LEFT JOIN invoices i ON i.order_id = o.id
      GROUP BY o.commitment_id
    ) order_totals ON order_totals.commitment_id = c.id
    LEFT JOIN (
      SELECT commitment_id, COUNT(*) AS item_count
      FROM commitment_items
      GROUP BY commitment_id
    ) item_totals ON item_totals.commitment_id = c.id
    LEFT JOIN (
      SELECT commitment_id, COUNT(*) AS alert_count
      FROM (
        SELECT ci2.commitment_id, ci2.id
        FROM commitment_items ci2
        LEFT JOIN (
          SELECT effective.commitment_item_id, SUM(effective.quantity) AS used_quantity
          FROM (
            SELECT oi.commitment_item_id, oi.quantity
            FROM order_items oi
            LEFT JOIN invoices invoice_for_order ON invoice_for_order.order_id = oi.order_id
            WHERE invoice_for_order.id IS NULL
            UNION ALL
            SELECT ii.commitment_item_id, ii.quantity
            FROM invoice_items ii
          ) effective
          GROUP BY effective.commitment_item_id
        ) usage ON usage.commitment_item_id = ci2.id
        GROUP BY ci2.commitment_id, ci2.id, ci2.contracted_quantity
        HAVING COALESCE(usage.used_quantity, 0) > ci2.contracted_quantity + 0.000001
      ) exceeded_items
      GROUP BY commitment_id
    ) alerts ON alerts.commitment_id = c.id
    WHERE ca.commitment_id ${archiveFilter}
    ORDER BY ${orderBy}`)
    .all<DataRow>();
}

export async function getDashboardData(): Promise<DashboardData> {
  const result = await getCommitmentRows(false);
  const commitments = mapDashboardCommitments(result.results);

  return {
    summary: commitments.reduce(
      (summary, commitment) => ({
        totalCents: summary.totalCents + commitment.totalCents,
        orderedCents: summary.orderedCents + commitment.orderedCents,
        balanceCents: summary.balanceCents + commitment.balanceCents,
        activeCount:
          summary.activeCount + (commitment.status === "ativa" ? 1 : 0),
        alertCount: summary.alertCount + commitment.alertCount,
      }),
      {
        totalCents: 0,
        orderedCents: 0,
        balanceCents: 0,
        activeCount: 0,
        alertCount: 0,
      },
    ),
    commitments,
  };
}

export async function getArchivedCommitments(): Promise<ArchivedCommitmentsData> {
  const result = await getCommitmentRows(true);
  return { commitments: mapDashboardCommitments(result.results) };
}

export async function getCommitmentDetail(
  id: string,
): Promise<CommitmentDetail | null> {
  await ensureDatabase();
  const db = getD1();
  const commitment = await db
    .prepare(`SELECT
      c.id,
      c.number,
      c.supplier,
      c.issue_date,
      c.status,
      c.notes,
      c.total_cents,
      ca.archived_at,
      COALESCE(SUM(COALESCE(i.total_cents, o.total_cents)), 0) AS ordered_cents,
      COUNT(DISTINCT o.id) AS order_count
    FROM commitments c
    LEFT JOIN commitment_archives ca ON ca.commitment_id = c.id
    LEFT JOIN orders o ON o.commitment_id = c.id
    LEFT JOIN invoices i ON i.order_id = o.id
    WHERE c.id = ?
    GROUP BY c.id, ca.archived_at`)
    .bind(id)
    .first<DataRow>();
  if (!commitment) return null;

  const [
    itemResult,
    orderResult,
    reinforcementResult,
    reinforcementItemResult,
    annulmentResult,
    annulmentItemResult,
  ] = await Promise.all([
    db
      .prepare(`SELECT
        ci.id,
        ci.line_number,
        ci.description,
        ci.unit,
        ci.contracted_quantity,
        ci.unit_price_cents,
        COALESCE(usage.ordered_quantity, 0) AS ordered_quantity
      FROM commitment_items ci
      LEFT JOIN (
        SELECT effective.commitment_item_id, SUM(effective.quantity) AS ordered_quantity
        FROM (
          SELECT oi.commitment_item_id, oi.quantity
          FROM order_items oi
          LEFT JOIN invoices i ON i.order_id = oi.order_id
          WHERE i.id IS NULL
          UNION ALL
          SELECT ii.commitment_item_id, ii.quantity
          FROM invoice_items ii
        ) effective
        GROUP BY effective.commitment_item_id
      ) usage ON usage.commitment_item_id = ci.id
      WHERE ci.commitment_id = ?
      ORDER BY ci.line_number ASC`)
      .bind(id)
      .all<DataRow>(),
    db
      .prepare(`SELECT
        o.id,
        o.reference,
        o.order_date,
        o.status,
        o.notes,
        o.calculated_total_cents,
        o.total_cents AS requested_total_cents,
        o.created_by,
        (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count,
        i.id AS invoice_id,
        i.number AS invoice_number,
        i.invoice_date,
        i.notes AS invoice_notes,
        i.calculated_total_cents AS invoice_calculated_total_cents,
        i.total_cents AS invoice_total_cents,
        i.created_by AS invoice_created_by,
        (SELECT COUNT(*) FROM invoice_items ii WHERE ii.invoice_id = i.id) AS invoice_item_count
      FROM orders o
      LEFT JOIN invoices i ON i.order_id = o.id
      WHERE o.commitment_id = ?
      ORDER BY o.order_date DESC, o.created_at DESC`)
      .bind(id)
      .all<DataRow>(),
    db
      .prepare(`SELECT
        r.id,
        r.reference,
        r.reinforcement_date,
        r.notes,
        r.total_cents,
        r.created_by,
        COUNT(ri.id) AS item_count
      FROM commitment_reinforcements r
      LEFT JOIN commitment_reinforcement_items ri ON ri.reinforcement_id = r.id
      WHERE r.commitment_id = ?
      GROUP BY r.id
      ORDER BY r.reinforcement_date DESC, r.created_at DESC`)
      .bind(id)
      .all<DataRow>(),
    db
      .prepare(`SELECT
        ri.reinforcement_id,
        ri.commitment_item_id,
        ci.line_number,
        ci.description,
        ci.unit,
        ri.added_quantity,
        ri.unit_price_cents,
        ri.added_total_cents
      FROM commitment_reinforcement_items ri
      JOIN commitment_reinforcements r ON r.id = ri.reinforcement_id
      JOIN commitment_items ci ON ci.id = ri.commitment_item_id
      WHERE r.commitment_id = ?
      ORDER BY r.reinforcement_date DESC, r.created_at DESC, ci.line_number ASC`)
      .bind(id)
      .all<DataRow>(),
    db
      .prepare(`SELECT
        a.id,
        a.type,
        a.reference,
        a.annulment_date,
        a.notes,
        a.calculated_total_cents,
        a.total_cents,
        a.created_by,
        COUNT(ai.id) AS item_count
      FROM commitment_annulments a
      LEFT JOIN commitment_annulment_items ai ON ai.annulment_id = a.id
      WHERE a.commitment_id = ?
      GROUP BY a.id
      ORDER BY a.annulment_date DESC, a.created_at DESC`)
      .bind(id)
      .all<DataRow>(),
    db
      .prepare(`SELECT
        ai.annulment_id,
        ai.commitment_item_id,
        ci.line_number,
        ci.description,
        ci.unit,
        ai.annulled_quantity,
        ai.unit_price_cents,
        ai.annulled_total_cents
      FROM commitment_annulment_items ai
      JOIN commitment_annulments a ON a.id = ai.annulment_id
      JOIN commitment_items ci ON ci.id = ai.commitment_item_id
      WHERE a.commitment_id = ?
      ORDER BY a.annulment_date DESC, a.created_at DESC, ci.line_number ASC`)
      .bind(id)
      .all<DataRow>(),
  ]);

  const items = itemResult.results.map((row) => {
    const contractedQuantity = asNumber(row.contracted_quantity);
    const orderedQuantity = asNumber(row.ordered_quantity);
    const balanceQuantity = contractedQuantity - orderedQuantity;
    const unitPriceCents = asNumber(row.unit_price_cents);
    return {
      id: String(row.id),
      lineNumber: asNumber(row.line_number),
      description: String(row.description),
      unit: String(row.unit),
      contractedQuantity,
      orderedQuantity,
      balanceQuantity,
      unitPriceCents,
      contractedTotalCents: Math.round(
        contractedQuantity * unitPriceCents,
      ),
      balanceAtCommitmentPriceCents: Math.round(
        balanceQuantity * unitPriceCents,
      ),
    };
  });

  const totalCents = asNumber(commitment.total_cents);
  const orderedCents = asNumber(commitment.ordered_cents);
  const reinforcementItemsById = new Map<string, ReinforcementItemDetail[]>();
  for (const row of reinforcementItemResult.results) {
    const reinforcementId = String(row.reinforcement_id);
    const reinforcementItems = reinforcementItemsById.get(reinforcementId) ?? [];
    reinforcementItems.push({
      commitmentItemId: String(row.commitment_item_id),
      lineNumber: asNumber(row.line_number),
      description: String(row.description),
      unit: String(row.unit),
      addedQuantity: asNumber(row.added_quantity),
      unitPriceCents: asNumber(row.unit_price_cents),
      addedTotalCents: asNumber(row.added_total_cents),
    });
    reinforcementItemsById.set(reinforcementId, reinforcementItems);
  }
  const annulmentItemsById = new Map<string, AnnulmentItemDetail[]>();
  for (const row of annulmentItemResult.results) {
    const annulmentId = String(row.annulment_id);
    const annulmentItems = annulmentItemsById.get(annulmentId) ?? [];
    annulmentItems.push({
      commitmentItemId: String(row.commitment_item_id),
      lineNumber: asNumber(row.line_number),
      description: String(row.description),
      unit: String(row.unit),
      annulledQuantity: asNumber(row.annulled_quantity),
      unitPriceCents: asNumber(row.unit_price_cents),
      annulledTotalCents: asNumber(row.annulled_total_cents),
    });
    annulmentItemsById.set(annulmentId, annulmentItems);
  }

  return {
    id: String(commitment.id),
    number: String(commitment.number),
    supplier: String(commitment.supplier),
    issueDate: String(commitment.issue_date),
    status: String(commitment.status) as CommitmentStatus,
    notes: String(commitment.notes ?? ""),
    totalCents,
    orderedCents,
    balanceCents: totalCents - orderedCents,
    orderCount: asNumber(commitment.order_count),
    alertCount: items.filter((item) => item.balanceQuantity < -0.000001).length,
    archived: Boolean(commitment.archived_at),
    archivedAt: commitment.archived_at ? String(commitment.archived_at) : null,
    reinforcementCount: reinforcementResult.results.length,
    reinforcementTotalCents: reinforcementResult.results.reduce(
      (sum, row) => sum + asNumber(row.total_cents),
      0,
    ),
    annulmentCount: annulmentResult.results.length,
    annulmentTotalCents: annulmentResult.results.reduce(
      (sum, row) => sum + asNumber(row.total_cents),
      0,
    ),
    items,
    orders: orderResult.results.map((row) => {
      const requestedCalculatedTotalCents = asNumber(row.calculated_total_cents);
      const requestedTotalCents = asNumber(row.requested_total_cents);
      const hasInvoice = Boolean(row.invoice_id);
      const calculatedTotalCents = hasInvoice
        ? asNumber(row.invoice_calculated_total_cents)
        : requestedCalculatedTotalCents;
      const effectiveTotalCents = hasInvoice
        ? asNumber(row.invoice_total_cents)
        : requestedTotalCents;
      return {
        id: String(row.id),
        reference: String(row.reference),
        orderDate: String(row.order_date),
        status: hasInvoice ? "faturado" as const : "rascunho" as const,
        notes: String(row.notes ?? ""),
        calculatedTotalCents,
        requestedTotalCents,
        totalCents: effectiveTotalCents,
        hasValueAdjustment: calculatedTotalCents !== effectiveTotalCents,
        itemCount: asNumber(row.item_count),
        createdBy: String(row.created_by ?? ""),
        invoice: hasInvoice
          ? {
              id: String(row.invoice_id),
              number: String(row.invoice_number),
              invoiceDate: String(row.invoice_date),
              notes: String(row.invoice_notes ?? ""),
              calculatedTotalCents: asNumber(row.invoice_calculated_total_cents),
              totalCents: asNumber(row.invoice_total_cents),
              itemCount: asNumber(row.invoice_item_count),
              createdBy: String(row.invoice_created_by ?? ""),
            }
          : null,
      };
    }),
    reinforcements: reinforcementResult.results.map((row) => ({
      id: String(row.id),
      reference: String(row.reference),
      reinforcementDate: String(row.reinforcement_date),
      notes: String(row.notes ?? ""),
      totalCents: asNumber(row.total_cents),
      itemCount: asNumber(row.item_count),
      createdBy: String(row.created_by ?? ""),
      items: reinforcementItemsById.get(String(row.id)) ?? [],
    })),
    annulments: annulmentResult.results.map((row) => {
      const calculatedTotalCents = asNumber(row.calculated_total_cents);
      const totalCents = asNumber(row.total_cents);
      return {
        id: String(row.id),
        type: String(row.type) as "parcial" | "total",
        reference: String(row.reference),
        annulmentDate: String(row.annulment_date),
        notes: String(row.notes ?? ""),
        calculatedTotalCents,
        totalCents,
        hasValueAdjustment: calculatedTotalCents !== totalCents,
        itemCount: asNumber(row.item_count),
        createdBy: String(row.created_by ?? ""),
        items: annulmentItemsById.get(String(row.id)) ?? [],
      };
    }),
  };
}

function validateIsoDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

type TransactionItem = {
  commitmentItemId: string;
  quantity: number;
  unitPriceCents: number;
};

function normalizeTransactionItems(
  candidates: Array<{
    commitmentItemId: string;
    quantity: number;
    unitPriceCents?: number;
  }> | undefined,
  allowedItems: Map<string, number>,
): TransactionItem[] {
  const combined = new Map<string, TransactionItem>();
  for (const candidate of candidates ?? []) {
    const commitmentItemId = String(candidate.commitmentItemId ?? "");
    const quantity = Number(candidate.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    const defaultPrice = allowedItems.get(commitmentItemId);
    if (defaultPrice === undefined) {
      throw new DomainError("Um dos itens não pertence a este lançamento.");
    }
    const unitPriceCents = Math.round(
      Number(candidate.unitPriceCents ?? defaultPrice),
    );
    if (!Number.isInteger(unitPriceCents) || unitPriceCents <= 0) {
      throw new DomainError("Há um preço unitário inválido.");
    }
    const existing = combined.get(commitmentItemId);
    combined.set(commitmentItemId, {
      commitmentItemId,
      quantity: quantity + (existing?.quantity ?? 0),
      unitPriceCents,
    });
  }
  return [...combined.values()];
}

function resolveTransactionTotal(
  items: TransactionItem[],
  informedTotalCents: number | null | undefined,
) {
  const calculatedTotalCents = items.reduce(
    (sum, item) => sum + Math.round(item.quantity * item.unitPriceCents),
    0,
  );
  const informedTotal = Number(informedTotalCents);
  const totalCents =
    informedTotalCents !== null &&
    informedTotalCents !== undefined &&
    Number.isFinite(informedTotal) &&
    informedTotal > 0
      ? Math.round(informedTotal)
      : calculatedTotalCents;
  return { calculatedTotalCents, totalCents };
}

function mapOrderItemRows(rows: DataRow[]) {
  return rows.map((row) => ({
    commitmentItemId: String(row.commitment_item_id),
    lineNumber: asNumber(row.line_number),
    description: String(row.description),
    unit: String(row.unit),
    quantity: asNumber(row.quantity),
    unitPriceCents: asNumber(row.unit_price_cents),
  }));
}

export async function getOrderDetail(id: string): Promise<OrderDetail | null> {
  await ensureDatabase();
  const db = getD1();
  const order = await db
    .prepare(`SELECT
      o.id,
      o.commitment_id,
      c.number AS commitment_number,
      c.supplier,
      c.issue_date AS commitment_issue_date,
      o.reference,
      o.order_date,
      o.notes,
      o.calculated_total_cents,
      o.total_cents AS requested_total_cents,
      i.id AS invoice_id,
      i.number AS invoice_number,
      i.invoice_date,
      i.notes AS invoice_notes,
      i.calculated_total_cents AS invoice_calculated_total_cents,
      i.total_cents AS invoice_total_cents,
      i.created_by AS invoice_created_by
    FROM orders o
    JOIN commitments c ON c.id = o.commitment_id
    LEFT JOIN invoices i ON i.order_id = o.id
    WHERE o.id = ?`)
    .bind(id)
    .first<DataRow>();
  if (!order) return null;

  const requestedItems = await db
    .prepare(`SELECT
      oi.commitment_item_id,
      ci.line_number,
      ci.description,
      ci.unit,
      oi.quantity,
      oi.unit_price_cents
    FROM order_items oi
    JOIN commitment_items ci ON ci.id = oi.commitment_item_id
    WHERE oi.order_id = ?
    ORDER BY ci.line_number ASC`)
    .bind(id)
    .all<DataRow>();

  let invoiceItems: DataRow[] = [];
  if (order.invoice_id) {
    const result = await db
      .prepare(`SELECT
        ii.commitment_item_id,
        ci.line_number,
        ci.description,
        ci.unit,
        ii.quantity,
        ii.unit_price_cents
      FROM invoice_items ii
      JOIN commitment_items ci ON ci.id = ii.commitment_item_id
      WHERE ii.invoice_id = ?
      ORDER BY ci.line_number ASC`)
      .bind(String(order.invoice_id))
      .all<DataRow>();
    invoiceItems = result.results;
  }

  const invoice = order.invoice_id
    ? {
        id: String(order.invoice_id),
        number: String(order.invoice_number),
        invoiceDate: String(order.invoice_date),
        notes: String(order.invoice_notes ?? ""),
        calculatedTotalCents: asNumber(order.invoice_calculated_total_cents),
        totalCents: asNumber(order.invoice_total_cents),
        itemCount: invoiceItems.length,
        createdBy: String(order.invoice_created_by ?? ""),
        items: mapOrderItemRows(invoiceItems),
      }
    : null;

  return {
    id: String(order.id),
    commitmentId: String(order.commitment_id),
    commitmentNumber: String(order.commitment_number),
    supplier: String(order.supplier),
    commitmentIssueDate: String(order.commitment_issue_date),
    reference: String(order.reference),
    orderDate: String(order.order_date),
    status: invoice ? "faturado" : "rascunho",
    notes: String(order.notes ?? ""),
    calculatedTotalCents: asNumber(order.calculated_total_cents),
    requestedTotalCents: asNumber(order.requested_total_cents),
    items: mapOrderItemRows(requestedItems.results),
    invoice,
  };
}

export async function createCommitment(
  payload: CreateCommitmentPayload,
  createdBy: string,
) {
  await ensureDatabase();
  const db = getD1();
  const number = String(payload.number ?? "").trim().replace(/^NE\s*/i, "");
  const supplier = String(payload.supplier ?? "").trim();
  const notes = String(payload.notes ?? "").trim();

  if (!number) throw new DomainError("Informe o número da NE.");
  if (!supplier) throw new DomainError("Informe o fornecedor.");
  if (!validateIsoDate(payload.issueDate)) {
    throw new DomainError("Informe uma data válida para a NE.");
  }
  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    throw new DomainError("Adicione pelo menos um item à NE.");
  }

  const seenLines = new Set<number>();
  const items = payload.items.map((item, index) => {
    const lineNumber = Number(item.lineNumber || index + 1);
    const description = String(item.description ?? "").trim();
    const unit = String(item.unit ?? "").trim();
    const contractedQuantity = Number(item.contractedQuantity);
    const unitPriceCents = Math.round(Number(item.unitPriceCents));
    if (!Number.isInteger(lineNumber) || lineNumber <= 0 || seenLines.has(lineNumber)) {
      throw new DomainError("Os números dos itens devem ser únicos e maiores que zero.");
    }
    if (!description || !unit) {
      throw new DomainError(`Preencha a descrição e a unidade do item ${lineNumber}.`);
    }
    if (!Number.isFinite(contractedQuantity) || contractedQuantity <= 0) {
      throw new DomainError(`A quantidade do item ${lineNumber} deve ser maior que zero.`);
    }
    if (!Number.isInteger(unitPriceCents) || unitPriceCents <= 0) {
      throw new DomainError(`O valor unitário do item ${lineNumber} é inválido.`);
    }
    seenLines.add(lineNumber);
    return {
      id: crypto.randomUUID(),
      lineNumber,
      description,
      unit,
      contractedQuantity,
      unitPriceCents,
    };
  });

  const totalCents = items.reduce(
    (sum, item) =>
      sum + Math.round(item.contractedQuantity * item.unitPriceCents),
    0,
  );
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const statements = [
    db
      .prepare(`INSERT INTO commitments
        (id, number, supplier, issue_date, status, notes, total_cents, created_at, created_by)
        VALUES (?, ?, ?, ?, 'ativa', ?, ?, ?, ?)`)
      .bind(
        id,
        number,
        supplier,
        payload.issueDate,
        notes,
        totalCents,
        createdAt,
        createdBy,
      ),
    ...items.map((item) =>
      db
        .prepare(`INSERT INTO commitment_items
          (id, commitment_id, line_number, description, unit, contracted_quantity, unit_price_cents)
          VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          item.id,
          id,
          item.lineNumber,
          item.description,
          item.unit,
          item.contractedQuantity,
          item.unitPriceCents,
        ),
    ),
  ];

  try {
    await db.batch(statements);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.toLowerCase().includes("unique")) {
      throw new DomainError(
        `A NE ${number} já está cadastrada.`,
        409,
        "DUPLICATE_NE",
      );
    }
    throw error;
  }
  return { id, number, totalCents };
}

export async function createOrder(
  commitmentId: string,
  payload: CreateOrderPayload,
  createdBy: string,
) {
  await ensureDatabase();
  const db = getD1();
  if (!validateIsoDate(payload.orderDate)) {
    throw new DomainError("Informe uma data válida para o pedido.");
  }

  const commitment = await db
    .prepare(`SELECT
      c.id,
      c.status,
      c.total_cents,
      ca.commitment_id AS archived_id,
      COALESCE(SUM(COALESCE(i.total_cents, o.total_cents)), 0) AS ordered_cents
    FROM commitments c
    LEFT JOIN commitment_archives ca ON ca.commitment_id = c.id
    LEFT JOIN orders o ON o.commitment_id = c.id
    LEFT JOIN invoices i ON i.order_id = o.id
    WHERE c.id = ?
    GROUP BY c.id, ca.commitment_id`)
    .bind(commitmentId)
    .first<DataRow>();
  if (!commitment) {
    throw new DomainError("NE não encontrada.", 404, "NOT_FOUND");
  }
  if (commitment.archived_id) {
    throw new DomainError(
      "Desarquive a NE antes de registrar novos pedidos.",
      409,
      "ARCHIVED_COMMITMENT",
    );
  }
  if (commitment.status === "encerrada") {
    throw new DomainError(
      "Esta NE está encerrada. Registre um reforço antes de criar novos pedidos.",
      409,
      "COMMITMENT_CLOSED",
    );
  }

  const itemRows = await db
    .prepare(`SELECT id, unit_price_cents
      FROM commitment_items
      WHERE commitment_id = ?`)
    .bind(commitmentId)
    .all<DataRow>();
  const allowedItems = new Map(
    itemRows.results.map((row) => [
      String(row.id),
      asNumber(row.unit_price_cents),
    ]),
  );

  const items = normalizeTransactionItems(payload.items, allowedItems);
  if (items.length === 0) {
    throw new DomainError("Informe a quantidade de pelo menos um item.");
  }

  const { calculatedTotalCents, totalCents } = resolveTransactionTotal(
    items,
    payload.informedTotalCents,
  );
  const totalLimitCents = asNumber(commitment.total_cents);
  const alreadyOrderedCents = asNumber(commitment.ordered_cents);
  const remainingCents = totalLimitCents - alreadyOrderedCents;

  if (totalCents > remainingCents) {
    throw new DomainError(
      "Este pedido ultrapassa o saldo disponível da NE.",
      409,
      "NE_LIMIT_EXCEEDED",
      { remainingCents },
    );
  }

  const orderId = crypto.randomUUID();
  const reference = String(payload.reference ?? "").trim() || "Pedido sem referência";
  const createdAt = new Date().toISOString();
  const notes = String(payload.notes ?? "").trim();
  const statements = [
    db
      .prepare(`INSERT INTO orders
        (id, commitment_id, reference, order_date, status, notes, calculated_total_cents, total_cents, created_at, created_by)
        SELECT ?, ?, ?, ?, 'rascunho', ?, ?, ?, ?, ?
        WHERE NOT EXISTS (
          SELECT 1 FROM commitment_archives WHERE commitment_id = ?
        ) AND (
          SELECT status FROM commitments WHERE id = ?
        ) <> 'encerrada' AND (
          SELECT COALESCE(SUM(COALESCE(i.total_cents, o.total_cents)), 0) + ?
          FROM orders o
          LEFT JOIN invoices i ON i.order_id = o.id
          WHERE o.commitment_id = ?
        ) <= (
          SELECT total_cents FROM commitments WHERE id = ?
        )`)
      .bind(
        orderId,
        commitmentId,
        reference,
        payload.orderDate,
        notes,
        calculatedTotalCents,
        totalCents,
        createdAt,
        createdBy,
        commitmentId,
        commitmentId,
        totalCents,
        commitmentId,
        commitmentId,
      ),
    ...items.map((item) =>
      db
        .prepare(`INSERT INTO order_items
          (id, order_id, commitment_item_id, quantity, unit_price_cents)
          SELECT ?, ?, ?, ?, ?
          WHERE EXISTS (SELECT 1 FROM orders WHERE id = ?)`)
        .bind(
          crypto.randomUUID(),
          orderId,
          item.commitmentItemId,
          item.quantity,
          item.unitPriceCents,
          orderId,
        ),
    ),
  ];

  const results = await db.batch(statements);
  const changes = Number(
    (results[0].meta as { changes?: number } | undefined)?.changes ?? 0,
  );
  if (changes === 0) {
    const latest = await db
      .prepare(`SELECT
        c.total_cents - COALESCE(SUM(COALESCE(i.total_cents, o.total_cents)), 0) AS remaining_cents
      FROM commitments c
      LEFT JOIN orders o ON o.commitment_id = c.id
      LEFT JOIN invoices i ON i.order_id = o.id
      WHERE c.id = ?
      GROUP BY c.id`)
      .bind(commitmentId)
      .first<{ remaining_cents: number }>();
    throw new DomainError(
      "Outro pedido consumiu parte do saldo. Atualize a tela e revise os valores.",
      409,
      "NE_LIMIT_EXCEEDED",
      { remainingCents: asNumber(latest?.remaining_cents) },
    );
  }

  return { id: orderId, totalCents, calculatedTotalCents };
}

export async function updateOrder(
  id: string,
  payload: CreateOrderPayload,
) {
  await ensureDatabase();
  const db = getD1();
  if (!validateIsoDate(payload.orderDate)) {
    throw new DomainError("Informe uma data válida para o pedido.");
  }

  const order = await db
    .prepare(`SELECT
      o.id,
      o.commitment_id,
      c.total_cents,
      ca.commitment_id AS archived_id,
      i.id AS invoice_id
    FROM orders o
    JOIN commitments c ON c.id = o.commitment_id
    LEFT JOIN commitment_archives ca ON ca.commitment_id = c.id
    LEFT JOIN invoices i ON i.order_id = o.id
    WHERE o.id = ?`)
    .bind(id)
    .first<DataRow>();
  if (!order) {
    throw new DomainError("Pedido não encontrado.", 404, "NOT_FOUND");
  }
  if (order.archived_id) {
    throw new DomainError(
      "Desarquive a NE antes de editar o pedido.",
      409,
      "ARCHIVED_COMMITMENT",
    );
  }
  if (order.invoice_id) {
    throw new DomainError(
      "Este pedido já virou nota fiscal. Edite os dados da NF.",
      409,
      "ORDER_ALREADY_INVOICED",
    );
  }

  const commitmentId = String(order.commitment_id);
  const itemRows = await db
    .prepare(`SELECT id, unit_price_cents
      FROM commitment_items
      WHERE commitment_id = ?`)
    .bind(commitmentId)
    .all<DataRow>();
  const allowedItems = new Map(
    itemRows.results.map((row) => [
      String(row.id),
      asNumber(row.unit_price_cents),
    ]),
  );
  const items = normalizeTransactionItems(payload.items, allowedItems);
  if (items.length === 0) {
    throw new DomainError("Informe a quantidade de pelo menos um item.");
  }
  const { calculatedTotalCents, totalCents } = resolveTransactionTotal(
    items,
    payload.informedTotalCents,
  );
  const otherOrders = await db
    .prepare(`SELECT COALESCE(SUM(COALESCE(i.total_cents, o.total_cents)), 0) AS total_cents
      FROM orders o
      LEFT JOIN invoices i ON i.order_id = o.id
      WHERE o.commitment_id = ? AND o.id <> ?`)
    .bind(commitmentId, id)
    .first<DataRow>();
  const remainingCents = asNumber(order.total_cents) - asNumber(otherOrders?.total_cents);
  if (totalCents > remainingCents) {
    throw new DomainError(
      "A alteração ultrapassa o saldo disponível da NE.",
      409,
      "NE_LIMIT_EXCEEDED",
      { remainingCents },
    );
  }

  const reference = String(payload.reference ?? "").trim() || "Pedido sem referência";
  const notes = String(payload.notes ?? "").trim();
  await db.batch([
    db
      .prepare(`UPDATE orders
        SET reference = ?, order_date = ?, status = 'rascunho', notes = ?,
            calculated_total_cents = ?, total_cents = ?
        WHERE id = ?`)
      .bind(
        reference,
        payload.orderDate,
        notes,
        calculatedTotalCents,
        totalCents,
        id,
      ),
    db.prepare("DELETE FROM order_items WHERE order_id = ?").bind(id),
    ...items.map((item) =>
      db
        .prepare(`INSERT INTO order_items
          (id, order_id, commitment_item_id, quantity, unit_price_cents)
          VALUES (?, ?, ?, ?, ?)`)
        .bind(
          crypto.randomUUID(),
          id,
          item.commitmentItemId,
          item.quantity,
          item.unitPriceCents,
        ),
    ),
  ]);

  return { id, totalCents, calculatedTotalCents };
}

export async function upsertInvoice(
  orderId: string,
  payload: CreateInvoicePayload,
  userLabel: string,
) {
  await ensureDatabase();
  const db = getD1();
  const number = String(payload.number ?? "").trim().replace(/^NF\s*/i, "");
  if (!number) throw new DomainError("Informe o número da nota fiscal.");
  if (!validateIsoDate(payload.invoiceDate)) {
    throw new DomainError("Informe uma data válida para a nota fiscal.");
  }

  const order = await db
    .prepare(`SELECT
      o.id,
      o.commitment_id,
      c.total_cents AS commitment_total_cents,
      ca.commitment_id AS archived_id,
      i.id AS invoice_id,
      i.created_at AS invoice_created_at,
      i.created_by AS invoice_created_by
    FROM orders o
    JOIN commitments c ON c.id = o.commitment_id
    LEFT JOIN commitment_archives ca ON ca.commitment_id = c.id
    LEFT JOIN invoices i ON i.order_id = o.id
    WHERE o.id = ?`)
    .bind(orderId)
    .first<DataRow>();
  if (!order) {
    throw new DomainError("Pedido não encontrado.", 404, "NOT_FOUND");
  }
  if (order.archived_id) {
    throw new DomainError(
      "Desarquive a NE antes de registrar a nota fiscal.",
      409,
      "ARCHIVED_COMMITMENT",
    );
  }

  const requestedItems = await db
    .prepare(`SELECT commitment_item_id, unit_price_cents
      FROM order_items WHERE order_id = ?`)
    .bind(orderId)
    .all<DataRow>();
  const allowedItems = new Map(
    requestedItems.results.map((row) => [
      String(row.commitment_item_id),
      asNumber(row.unit_price_cents),
    ]),
  );
  const items = normalizeTransactionItems(payload.items, allowedItems);
  if (items.length === 0) {
    throw new DomainError("Informe a quantidade entregue de pelo menos um item.");
  }
  const { calculatedTotalCents, totalCents } = resolveTransactionTotal(
    items,
    payload.informedTotalCents,
  );
  const commitmentId = String(order.commitment_id);
  const otherOrders = await db
    .prepare(`SELECT COALESCE(SUM(COALESCE(i.total_cents, o.total_cents)), 0) AS total_cents
      FROM orders o
      LEFT JOIN invoices i ON i.order_id = o.id
      WHERE o.commitment_id = ? AND o.id <> ?`)
    .bind(commitmentId, orderId)
    .first<DataRow>();
  const remainingCents =
    asNumber(order.commitment_total_cents) - asNumber(otherOrders?.total_cents);
  if (totalCents > remainingCents) {
    throw new DomainError(
      "O valor da nota fiscal ultrapassa o saldo disponível da NE.",
      409,
      "NE_LIMIT_EXCEEDED",
      { remainingCents },
    );
  }

  const invoiceId = order.invoice_id
    ? String(order.invoice_id)
    : crypto.randomUUID();
  const now = new Date().toISOString();
  const notes = String(payload.notes ?? "").trim();
  const invoiceStatement = order.invoice_id
    ? db
        .prepare(`UPDATE invoices
          SET number = ?, invoice_date = ?, notes = ?, calculated_total_cents = ?,
              total_cents = ?, updated_at = ?, updated_by = ?
          WHERE id = ?`)
        .bind(
          number,
          payload.invoiceDate,
          notes,
          calculatedTotalCents,
          totalCents,
          now,
          userLabel,
          invoiceId,
        )
    : db
        .prepare(`INSERT INTO invoices
          (id, order_id, number, invoice_date, notes, calculated_total_cents, total_cents, created_at, created_by, updated_at, updated_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          invoiceId,
          orderId,
          number,
          payload.invoiceDate,
          notes,
          calculatedTotalCents,
          totalCents,
          now,
          userLabel,
          now,
          userLabel,
        );

  await db.batch([
    invoiceStatement,
    db.prepare("DELETE FROM invoice_items WHERE invoice_id = ?").bind(invoiceId),
    ...items.map((item) =>
      db
        .prepare(`INSERT INTO invoice_items
          (id, invoice_id, commitment_item_id, quantity, unit_price_cents)
          VALUES (?, ?, ?, ?, ?)`)
        .bind(
          crypto.randomUUID(),
          invoiceId,
          item.commitmentItemId,
          item.quantity,
          item.unitPriceCents,
        ),
    ),
    db.prepare("UPDATE orders SET status = 'faturado' WHERE id = ?").bind(orderId),
  ]);

  return { id: invoiceId, orderId, number, totalCents, calculatedTotalCents };
}

export async function archiveCommitment(id: string, archivedBy: string) {
  await ensureDatabase();
  const db = getD1();
  const commitment = await db
    .prepare("SELECT id FROM commitments WHERE id = ?")
    .bind(id)
    .first<{ id: string }>();
  if (!commitment) {
    throw new DomainError("NE não encontrada.", 404, "NOT_FOUND");
  }
  const archivedAt = new Date().toISOString();
  await db
    .prepare(`INSERT INTO commitment_archives (commitment_id, archived_at, archived_by)
      VALUES (?, ?, ?)
      ON CONFLICT(commitment_id) DO UPDATE SET
        archived_at = excluded.archived_at,
        archived_by = excluded.archived_by`)
    .bind(id, archivedAt, archivedBy)
    .run();
  return { id, archivedAt };
}

export async function unarchiveCommitment(id: string) {
  await ensureDatabase();
  const db = getD1();
  const archived = await db
    .prepare("SELECT commitment_id FROM commitment_archives WHERE commitment_id = ?")
    .bind(id)
    .first<{ commitment_id: string }>();
  if (!archived) {
    throw new DomainError("Esta NE não está arquivada.", 404, "NOT_FOUND");
  }
  await db
    .prepare("DELETE FROM commitment_archives WHERE commitment_id = ?")
    .bind(id)
    .run();
  return { id };
}

export async function createReinforcement(
  commitmentId: string,
  payload: CreateReinforcementPayload,
  createdBy: string,
) {
  await ensureDatabase();
  const db = getD1();
  if (!validateIsoDate(payload.reinforcementDate)) {
    throw new DomainError("Informe uma data válida para o reforço.");
  }

  const commitment = await db
    .prepare(`SELECT c.id, ca.commitment_id AS archived_id
      FROM commitments c
      LEFT JOIN commitment_archives ca ON ca.commitment_id = c.id
      WHERE c.id = ?`)
    .bind(commitmentId)
    .first<DataRow>();
  if (!commitment) {
    throw new DomainError("NE não encontrada.", 404, "NOT_FOUND");
  }
  if (commitment.archived_id) {
    throw new DomainError(
      "Desarquive a NE antes de registrar um reforço.",
      409,
      "ARCHIVED_COMMITMENT",
    );
  }

  const itemRows = await db
    .prepare(`SELECT id, unit_price_cents
      FROM commitment_items
      WHERE commitment_id = ?`)
    .bind(commitmentId)
    .all<DataRow>();
  const allowedItems = new Map(
    itemRows.results.map((row) => [
      String(row.id),
      asNumber(row.unit_price_cents),
    ]),
  );

  const combined = new Map<
    string,
    { commitmentItemId: string; addedQuantity: number; unitPriceCents: number }
  >();
  for (const candidate of payload.items ?? []) {
    const commitmentItemId = String(candidate.commitmentItemId ?? "");
    const addedQuantity = Number(candidate.addedQuantity);
    if (!Number.isFinite(addedQuantity) || addedQuantity <= 0) continue;
    const unitPriceCents = allowedItems.get(commitmentItemId);
    if (unitPriceCents === undefined) {
      throw new DomainError("Um dos itens não pertence a esta NE.");
    }
    const existing = combined.get(commitmentItemId);
    combined.set(commitmentItemId, {
      commitmentItemId,
      addedQuantity: addedQuantity + (existing?.addedQuantity ?? 0),
      unitPriceCents,
    });
  }

  const items = [...combined.values()].map((item) => ({
    ...item,
    addedTotalCents: Math.round(item.addedQuantity * item.unitPriceCents),
  }));
  if (items.length === 0) {
    throw new DomainError("Informe a quantidade de reforço de pelo menos um item.");
  }

  const totalCents = items.reduce(
    (sum, item) => sum + item.addedTotalCents,
    0,
  );
  const reinforcementId = crypto.randomUUID();
  const reference = String(payload.reference ?? "").trim() ||
    `Reforço ${payload.reinforcementDate}`;
  const notes = String(payload.notes ?? "").trim();
  const createdAt = new Date().toISOString();

  await db.batch([
    db
      .prepare(`INSERT INTO commitment_reinforcements
        (id, commitment_id, reference, reinforcement_date, notes, total_cents, created_at, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`) 
      .bind(
        reinforcementId,
        commitmentId,
        reference,
        payload.reinforcementDate,
        notes,
        totalCents,
        createdAt,
        createdBy,
      ),
    ...items.map((item) =>
      db
        .prepare(`INSERT INTO commitment_reinforcement_items
          (id, reinforcement_id, commitment_item_id, added_quantity, unit_price_cents, added_total_cents)
          VALUES (?, ?, ?, ?, ?, ?)`) 
        .bind(
          crypto.randomUUID(),
          reinforcementId,
          item.commitmentItemId,
          item.addedQuantity,
          item.unitPriceCents,
          item.addedTotalCents,
        ),
    ),
    ...items.map((item) =>
      db
        .prepare(`UPDATE commitment_items
          SET contracted_quantity = contracted_quantity + ?
          WHERE id = ? AND commitment_id = ?`)
        .bind(item.addedQuantity, item.commitmentItemId, commitmentId),
    ),
    db
      .prepare(`UPDATE commitments
        SET total_cents = total_cents + ?,
            status = CASE WHEN status = 'encerrada' THEN 'ativa' ELSE status END
        WHERE id = ?`)
      .bind(totalCents, commitmentId),
  ]);

  return { id: reinforcementId, reference, totalCents };
}

type AnnulmentItemSnapshot = {
  commitmentItemId: string;
  lineNumber: number;
  description: string;
  contractedQuantity: number;
  orderedQuantity: number;
  unitPriceCents: number;
};

type PlannedAnnulmentItem = AnnulmentItemSnapshot & {
  annulledQuantity: number;
  annulledTotalCents: number;
};

const QUANTITY_EPSILON = 0.000001;

export async function createAnnulment(
  commitmentId: string,
  payload: CreateAnnulmentPayload,
  createdBy: string,
) {
  await ensureDatabase();
  const db = getD1();
  if (!payload || typeof payload !== "object") {
    throw new DomainError("Informe os dados da anulação.");
  }
  if (payload.type !== "parcial" && payload.type !== "total") {
    throw new DomainError("Escolha entre anulação parcial ou total.");
  }
  if (!validateIsoDate(payload.annulmentDate)) {
    throw new DomainError("Informe uma data válida para a anulação.");
  }

  const commitment = await db
    .prepare(`SELECT
      c.id,
      c.total_cents,
      ca.commitment_id AS archived_id,
      COALESCE(SUM(COALESCE(i.total_cents, o.total_cents)), 0) AS ordered_cents
    FROM commitments c
    LEFT JOIN commitment_archives ca ON ca.commitment_id = c.id
    LEFT JOIN orders o ON o.commitment_id = c.id
    LEFT JOIN invoices i ON i.order_id = o.id
    WHERE c.id = ?
    GROUP BY c.id, ca.commitment_id`)
    .bind(commitmentId)
    .first<DataRow>();
  if (!commitment) {
    throw new DomainError("NE não encontrada.", 404, "NOT_FOUND");
  }
  if (commitment.archived_id) {
    throw new DomainError(
      "Desarquive a NE antes de registrar uma anulação.",
      409,
      "ARCHIVED_COMMITMENT",
    );
  }

  const itemResult = await db
    .prepare(`SELECT
      ci.id,
      ci.line_number,
      ci.description,
      ci.contracted_quantity,
      ci.unit_price_cents,
      COALESCE(usage.ordered_quantity, 0) AS ordered_quantity
    FROM commitment_items ci
    LEFT JOIN (
      SELECT effective.commitment_item_id, SUM(effective.quantity) AS ordered_quantity
      FROM (
        SELECT oi.commitment_item_id, oi.quantity
        FROM order_items oi
        LEFT JOIN invoices i ON i.order_id = oi.order_id
        WHERE i.id IS NULL
        UNION ALL
        SELECT ii.commitment_item_id, ii.quantity
        FROM invoice_items ii
      ) effective
      GROUP BY effective.commitment_item_id
    ) usage ON usage.commitment_item_id = ci.id
    WHERE ci.commitment_id = ?
    ORDER BY ci.line_number ASC`)
    .bind(commitmentId)
    .all<DataRow>();
  const snapshots: AnnulmentItemSnapshot[] = itemResult.results.map((row) => ({
    commitmentItemId: String(row.id),
    lineNumber: asNumber(row.line_number),
    description: String(row.description),
    contractedQuantity: asNumber(row.contracted_quantity),
    orderedQuantity: asNumber(row.ordered_quantity),
    unitPriceCents: asNumber(row.unit_price_cents),
  }));
  const snapshotsById = new Map(
    snapshots.map((item) => [item.commitmentItemId, item]),
  );

  let items: PlannedAnnulmentItem[];
  if (payload.type === "total") {
    items = snapshots
      .map((item) => ({
        ...item,
        annulledQuantity: item.contractedQuantity - item.orderedQuantity,
      }))
      .filter((item) => item.annulledQuantity > QUANTITY_EPSILON)
      .map((item) => ({
        ...item,
        annulledTotalCents: Math.round(
          item.annulledQuantity * item.unitPriceCents,
        ),
      }));
  } else {
    if (!Array.isArray(payload.items) || payload.items.length === 0) {
      throw new DomainError("Informe a quantidade a anular de pelo menos um item.");
    }
    const seenItems = new Set<string>();
    items = payload.items.map((candidate) => {
      if (!candidate || typeof candidate !== "object") {
        throw new DomainError("Há um item inválido na anulação.");
      }
      const itemId = String(candidate.commitmentItemId ?? "");
      const snapshot = snapshotsById.get(itemId);
      if (!snapshot) {
        throw new DomainError("Um dos itens não pertence a esta NE.");
      }
      if (seenItems.has(itemId)) {
        throw new DomainError(`O item ${snapshot.lineNumber} foi informado mais de uma vez.`);
      }
      seenItems.add(itemId);

      const annulledQuantity = typeof candidate.annulledQuantity === "number"
        ? candidate.annulledQuantity
        : Number.NaN;
      if (!Number.isFinite(annulledQuantity) || annulledQuantity <= 0) {
        throw new DomainError(
          `A quantidade a anular do item ${snapshot.lineNumber} deve ser maior que zero.`,
        );
      }
      if (
        Math.abs(
          annulledQuantity * 1000 - Math.round(annulledQuantity * 1000),
        ) > QUANTITY_EPSILON
      ) {
        throw new DomainError(
          `Use no máximo três casas decimais na quantidade do item ${snapshot.lineNumber}.`,
        );
      }
      const availableQuantity =
        snapshot.contractedQuantity - snapshot.orderedQuantity;
      if (availableQuantity <= QUANTITY_EPSILON) {
        throw new DomainError(
          `O item ${snapshot.lineNumber} não possui saldo disponível para anulação.`,
          409,
          "ITEM_WITHOUT_BALANCE",
        );
      }
      if (annulledQuantity > availableQuantity + QUANTITY_EPSILON) {
        throw new DomainError(
          `A quantidade a anular do item ${snapshot.lineNumber} ultrapassa o saldo disponível.`,
          409,
          "ANNULMENT_QUANTITY_EXCEEDED",
          { availableQuantity, item: snapshot.description },
        );
      }
      const safeQuantity = Math.min(annulledQuantity, availableQuantity);
      return {
        ...snapshot,
        annulledQuantity: safeQuantity,
        annulledTotalCents: Math.round(safeQuantity * snapshot.unitPriceCents),
      };
    });
  }

  const currentTotalCents = asNumber(commitment.total_cents);
  const orderedCents = asNumber(commitment.ordered_cents);
  const financialBalanceCents = currentTotalCents - orderedCents;
  if (financialBalanceCents < 0) {
    throw new DomainError(
      "A NE está com saldo financeiro negativo. Revise os pedidos e notas fiscais antes de anulá-la.",
      409,
      "NEGATIVE_COMMITMENT_BALANCE",
    );
  }
  const calculatedTotalCents = items.reduce(
    (sum, item) => sum + item.annulledTotalCents,
    0,
  );
  const totalCents = payload.type === "total"
    ? financialBalanceCents
    : calculatedTotalCents;
  if (payload.type === "parcial" && totalCents > financialBalanceCents) {
    throw new DomainError(
      "Esta anulação ultrapassa o saldo financeiro disponível da NE.",
      409,
      "ANNULMENT_VALUE_EXCEEDED",
      { remainingCents: financialBalanceCents },
    );
  }
  if (items.length === 0 && totalCents === 0) {
    throw new DomainError(
      "Esta NE não possui saldo disponível para anulação.",
      409,
      "COMMITMENT_WITHOUT_BALANCE",
    );
  }

  const annulmentId = crypto.randomUUID();
  const reference = String(payload.reference ?? "").trim() ||
    `Anulação ${payload.annulmentDate}`;
  const notes = String(payload.notes ?? "").trim();
  const createdAt = new Date().toISOString();
  const snapshotsToGuard = payload.type === "total" ? snapshots : items;
  const guardSnapshotJson = JSON.stringify(
    snapshotsToGuard.map((item) => ({
      id: item.commitmentItemId,
      contractedQuantity: item.contractedQuantity,
      orderedQuantity: item.orderedQuantity,
    })),
  );

  const insertAnnulment = db
    .prepare(`INSERT INTO commitment_annulments
      (id, commitment_id, type, reference, annulment_date, notes,
       calculated_total_cents, total_cents, created_at, created_by)
      SELECT ?, c.id, ?, ?, ?, ?, ?, ?, ?, ?
      FROM commitments c
      WHERE c.id = ?
        AND c.total_cents = ?
        AND NOT EXISTS (
          SELECT 1 FROM commitment_archives WHERE commitment_id = c.id
        )
        AND (
          SELECT COALESCE(SUM(COALESCE(i.total_cents, o.total_cents)), 0)
          FROM orders o
          LEFT JOIN invoices i ON i.order_id = o.id
          WHERE o.commitment_id = c.id
        ) = ?
        AND NOT EXISTS (
          SELECT 1
          FROM json_each(?) expected
          LEFT JOIN commitment_items guard_item
            ON guard_item.id = json_extract(expected.value, '$.id')
            AND guard_item.commitment_id = c.id
          WHERE guard_item.id IS NULL
            OR ABS(
              guard_item.contracted_quantity -
              CAST(json_extract(expected.value, '$.contractedQuantity') AS REAL)
            ) > ${QUANTITY_EPSILON}
            OR ABS(COALESCE((
            SELECT SUM(effective.quantity)
            FROM (
              SELECT oi.quantity
              FROM order_items oi
              LEFT JOIN invoices invoice_for_order ON invoice_for_order.order_id = oi.order_id
              WHERE oi.commitment_item_id = guard_item.id
                AND invoice_for_order.id IS NULL
              UNION ALL
              SELECT ii.quantity
              FROM invoice_items ii
              WHERE ii.commitment_item_id = guard_item.id
            ) effective
          ), 0) - CAST(
            json_extract(expected.value, '$.orderedQuantity') AS REAL
          )) > ${QUANTITY_EPSILON}
        )`)
    .bind(
      annulmentId,
      payload.type,
      reference,
      payload.annulmentDate,
      notes,
      calculatedTotalCents,
      totalCents,
      createdAt,
      createdBy,
      commitmentId,
      currentTotalCents,
      orderedCents,
      guardSnapshotJson,
    );

  const selectedQuantities = new Map(
    items.map((item) => [item.commitmentItemId, item.annulledQuantity]),
  );
  const hasRemainingItemBalance = snapshots.some((item) =>
    item.contractedQuantity - item.orderedQuantity -
      (selectedQuantities.get(item.commitmentItemId) ?? 0) > QUANTITY_EPSILON
  );
  const newTotalCents = currentTotalCents - totalCents;
  const shouldClose = payload.type === "total" ||
    newTotalCents <= orderedCents || !hasRemainingItemBalance;

  const results = await db.batch([
    insertAnnulment,
    ...items.map((item) =>
      db
        .prepare(`INSERT INTO commitment_annulment_items
          (id, annulment_id, commitment_item_id, annulled_quantity, unit_price_cents, annulled_total_cents)
          SELECT ?, ?, ?, ?, ?, ?
          WHERE EXISTS (SELECT 1 FROM commitment_annulments WHERE id = ?)`)
        .bind(
          crypto.randomUUID(),
          annulmentId,
          item.commitmentItemId,
          item.annulledQuantity,
          item.unitPriceCents,
          item.annulledTotalCents,
          annulmentId,
        ),
    ),
    ...items.map((item) =>
      db
        .prepare(`UPDATE commitment_items
          SET contracted_quantity = ?
          WHERE id = ? AND commitment_id = ?
            AND EXISTS (SELECT 1 FROM commitment_annulments WHERE id = ?)`)
        .bind(
          item.contractedQuantity - item.annulledQuantity,
          item.commitmentItemId,
          commitmentId,
          annulmentId,
        ),
    ),
    db
      .prepare(`UPDATE commitments
        SET total_cents = ?,
            status = CASE WHEN ? = 1 THEN 'encerrada' ELSE status END
        WHERE id = ?
          AND EXISTS (SELECT 1 FROM commitment_annulments WHERE id = ?)`)
      .bind(newTotalCents, shouldClose ? 1 : 0, commitmentId, annulmentId),
  ]);
  const changes = Number(
    (results[0].meta as { changes?: number } | undefined)?.changes ?? 0,
  );
  if (changes === 0) {
    throw new DomainError(
      "Os saldos desta NE foram alterados por outra operação. Atualize a tela e revise a anulação.",
      409,
      "ANNULMENT_CONFLICT",
    );
  }

  return {
    id: annulmentId,
    type: payload.type,
    reference,
    calculatedTotalCents,
    totalCents,
  };
}

export async function deleteOrder(id: string) {
  await ensureDatabase();
  const db = getD1();
  const existing = await db
    .prepare("SELECT id FROM orders WHERE id = ?")
    .bind(id)
    .first<{ id: string }>();
  if (!existing) {
    throw new DomainError("Pedido não encontrado.", 404, "NOT_FOUND");
  }
  await db.batch([
    db.prepare(`DELETE FROM invoice_items
      WHERE invoice_id IN (SELECT id FROM invoices WHERE order_id = ?)`)
      .bind(id),
    db.prepare("DELETE FROM invoices WHERE order_id = ?").bind(id),
    db.prepare("DELETE FROM order_items WHERE order_id = ?").bind(id),
    db.prepare("DELETE FROM orders WHERE id = ?").bind(id),
  ]);
  return { id };
}
