export type CommitmentStatus = "ativa" | "encerrada" | "suspensa";
export type OrderStatus = "rascunho" | "faturado";

export type DashboardCommitment = {
  id: string;
  number: string;
  supplier: string;
  issueDate: string;
  status: CommitmentStatus;
  totalCents: number;
  orderedCents: number;
  balanceCents: number;
  orderCount: number;
  itemCount: number;
  alertCount: number;
};

export type DashboardData = {
  summary: {
    totalCents: number;
    orderedCents: number;
    balanceCents: number;
    activeCount: number;
    alertCount: number;
  };
  commitments: DashboardCommitment[];
};

export type CommitmentItemBalance = {
  id: string;
  lineNumber: number;
  description: string;
  unit: string;
  contractedQuantity: number;
  orderedQuantity: number;
  balanceQuantity: number;
  unitPriceCents: number;
  contractedTotalCents: number;
  balanceAtCommitmentPriceCents: number;
};

export type OrderSummary = {
  id: string;
  reference: string;
  orderDate: string;
  status: OrderStatus;
  notes: string;
  calculatedTotalCents: number;
  requestedTotalCents: number;
  totalCents: number;
  hasValueAdjustment: boolean;
  itemCount: number;
  createdBy: string;
  invoice: InvoiceSummary | null;
};

export type InvoiceSummary = {
  id: string;
  number: string;
  invoiceDate: string;
  notes: string;
  calculatedTotalCents: number;
  totalCents: number;
  itemCount: number;
  createdBy: string;
};

export type OrderItemDetail = {
  commitmentItemId: string;
  lineNumber: number;
  description: string;
  unit: string;
  quantity: number;
  unitPriceCents: number;
};

export type OrderDetail = {
  id: string;
  commitmentId: string;
  commitmentNumber: string;
  supplier: string;
  commitmentIssueDate: string;
  reference: string;
  orderDate: string;
  status: OrderStatus;
  notes: string;
  calculatedTotalCents: number;
  requestedTotalCents: number;
  items: OrderItemDetail[];
  invoice: (InvoiceSummary & { items: OrderItemDetail[] }) | null;
};

export type ReinforcementSummary = {
  id: string;
  reference: string;
  reinforcementDate: string;
  notes: string;
  totalCents: number;
  itemCount: number;
  createdBy: string;
  items: ReinforcementItemDetail[];
};

export type ReinforcementItemDetail = {
  commitmentItemId: string;
  lineNumber: number;
  description: string;
  unit: string;
  addedQuantity: number;
  unitPriceCents: number;
  addedTotalCents: number;
};

export type AnnulmentType = "parcial" | "total";

export type AnnulmentSummary = {
  id: string;
  type: AnnulmentType;
  reference: string;
  annulmentDate: string;
  notes: string;
  calculatedTotalCents: number;
  totalCents: number;
  hasValueAdjustment: boolean;
  itemCount: number;
  createdBy: string;
  items: AnnulmentItemDetail[];
};

export type AnnulmentItemDetail = {
  commitmentItemId: string;
  lineNumber: number;
  description: string;
  unit: string;
  annulledQuantity: number;
  unitPriceCents: number;
  annulledTotalCents: number;
};

export type CommitmentDetail = {
  id: string;
  number: string;
  supplier: string;
  issueDate: string;
  status: CommitmentStatus;
  notes: string;
  totalCents: number;
  orderedCents: number;
  balanceCents: number;
  orderCount: number;
  alertCount: number;
  reinforcementCount: number;
  reinforcementTotalCents: number;
  annulmentCount: number;
  annulmentTotalCents: number;
  archived: boolean;
  archivedAt: string | null;
  items: CommitmentItemBalance[];
  orders: OrderSummary[];
  reinforcements: ReinforcementSummary[];
  annulments: AnnulmentSummary[];
};

export type CreateCommitmentPayload = {
  number: string;
  supplier: string;
  issueDate: string;
  notes?: string;
  items: Array<{
    lineNumber: number;
    description: string;
    unit: string;
    contractedQuantity: number;
    unitPriceCents: number;
  }>;
};

export type CreateOrderPayload = {
  reference?: string;
  orderDate: string;
  notes?: string;
  informedTotalCents?: number | null;
  items: Array<{
    commitmentItemId: string;
    quantity: number;
    unitPriceCents?: number;
  }>;
};

export type CreateInvoicePayload = {
  number: string;
  invoiceDate: string;
  notes?: string;
  informedTotalCents?: number | null;
  items: Array<{
    commitmentItemId: string;
    quantity: number;
    unitPriceCents?: number;
  }>;
};

export type ArchivedCommitmentsData = {
  commitments: DashboardCommitment[];
};

export type CreateReinforcementPayload = {
  reference?: string;
  reinforcementDate: string;
  notes?: string;
  items: Array<{
    commitmentItemId: string;
    addedQuantity: number;
  }>;
};

export type CreateAnnulmentPayload = {
  type: AnnulmentType;
  reference?: string;
  annulmentDate: string;
  notes?: string;
  items?: Array<{
    commitmentItemId: string;
    annulledQuantity: number;
  }>;
};

export type ApiErrorBody = {
  error: string;
  code?: string;
  remainingCents?: number;
};
