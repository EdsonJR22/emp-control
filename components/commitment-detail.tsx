"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/client-api";
import {
  formatCurrency,
  formatDate,
  formatQuantity,
} from "../lib/format";
import type { CommitmentDetail } from "../lib/types";
import { AnnulmentDetailModal } from "./annulment-detail-modal";
import { Icon } from "./icon";
import { InvoiceModal } from "./invoice-modal";
import { NewOrderModal } from "./new-order-modal";
import { NewAnnulmentModal } from "./new-annulment-modal";
import { NewReinforcementModal } from "./new-reinforcement-modal";
import { ReinforcementDetailModal } from "./reinforcement-detail-modal";

type ItemFilter = "todos" | "alertas" | "disponiveis" | "esgotados";

export function CommitmentDetailView() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const [commitment, setCommitment] = useState<CommitmentDetail | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ItemFilter>("todos");
  const [orderOpen, setOrderOpen] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [invoiceOrderId, setInvoiceOrderId] = useState<string | null>(null);
  const [reinforcementOpen, setReinforcementOpen] = useState(false);
  const [selectedReinforcementId, setSelectedReinforcementId] = useState<string | null>(null);
  const [annulmentOpen, setAnnulmentOpen] = useState(false);
  const [selectedAnnulmentId, setSelectedAnnulmentId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [archiveChanging, setArchiveChanging] = useState(false);

  const selectedReinforcement =
    commitment?.reinforcements.find(
      (reinforcement) => reinforcement.id === selectedReinforcementId,
    ) ?? null;
  const selectedAnnulment =
    commitment?.annulments.find(
      (annulment) => annulment.id === selectedAnnulmentId,
    ) ?? null;

  const load = useCallback(async () => {
    if (!id) return;
    setError("");
    try {
      const response = await apiFetch(`/api/commitments/${id}`, { cache: "no-store" });
      const body = (await response.json()) as
        | { commitment: CommitmentDetail }
        | { error: string };
      if (!response.ok || !("commitment" in body)) {
        throw new Error("error" in body ? body.error : "Falha ao carregar a NE.");
      }
      setCommitment(body.commitment);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Falha ao carregar a NE.",
      );
    }
  }, [id]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const filteredItems = useMemo(() => {
    if (!commitment) return [];
    const normalized = search.trim().toLocaleLowerCase("pt-BR");
    return commitment.items.filter((item) => {
      const matchesSearch =
        !normalized ||
        item.description.toLocaleLowerCase("pt-BR").includes(normalized) ||
        String(item.lineNumber).includes(normalized);
      const matchesFilter =
        filter === "todos" ||
        (filter === "alertas" && item.balanceQuantity < -0.000001) ||
        (filter === "disponiveis" && item.balanceQuantity > 0.000001) ||
        (filter === "esgotados" && Math.abs(item.balanceQuantity) < 0.000001);
      return matchesSearch && matchesFilter;
    });
  }, [commitment, filter, search]);

  const handleDelete = async (orderId: string, reference: string) => {
    if (!window.confirm(`Excluir ${reference}? O saldo da NE será recalculado.`)) return;
    setDeletingId(orderId);
    try {
      const response = await apiFetch(`/api/orders/${orderId}`, { method: "DELETE" });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Não foi possível excluir o pedido.");
      await load();
    } catch (requestError) {
      window.alert(
        requestError instanceof Error
          ? requestError.message
          : "Não foi possível excluir o pedido.",
      );
    } finally {
      setDeletingId(null);
    }
  };

  const handleArchiveChange = async () => {
    if (!commitment) return;
    if (
      !commitment.archived &&
      !window.confirm(
        `Arquivar a NE ${commitment.number}? Ela deixará de aparecer na visão geral e nas estatísticas.`,
      )
    ) return;
    setArchiveChanging(true);
    try {
      const response = await apiFetch(`/api/commitments/${commitment.id}/archive`, {
        method: commitment.archived ? "DELETE" : "POST",
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error || "Não foi possível alterar o arquivamento.");
      }
      await load();
    } catch (requestError) {
      window.alert(
        requestError instanceof Error
          ? requestError.message
          : "Não foi possível alterar o arquivamento.",
      );
    } finally {
      setArchiveChanging(false);
    }
  };

  if (error) {
    return (
      <div className="page-wrap">
        <Link href="/" className="back-link"><Icon name="arrow-left" /> Voltar para a visão geral</Link>
        <section className="error-state">
          <Icon name="alert" />
          <div><strong>Não foi possível abrir esta NE</strong><p>{error}</p></div>
          <button className="button button-secondary" type="button" onClick={() => void load()}>Tentar novamente</button>
        </section>
      </div>
    );
  }

  if (!commitment) {
    return <div className="page-wrap"><div className="skeleton skeleton-detail" /></div>;
  }

  const rawProgress = commitment.totalCents
    ? (commitment.orderedCents / commitment.totalCents) * 100
    : 0;
  const progress = Math.max(0, Math.min(100, rawProgress));
  const closed = commitment.balanceCents <= 0 || commitment.status === "encerrada";

  return (
    <div className="page-wrap">
      <Link href={commitment.archived ? "/arquivadas" : "/"} className="back-link">
        <Icon name="arrow-left" /> {commitment.archived ? "Voltar para as NEs arquivadas" : "Voltar para a visão geral"}
      </Link>
      <header className="detail-header">
        <div>
          <div className="detail-title-line">
            <h1>NE {commitment.number}</h1>
            <span className={`badge ${closed ? "badge-neutral" : "badge-success"}`}>
              {closed ? "Encerrada" : "Ativa"}
            </span>
          </div>
          <p>{commitment.supplier} · Emitida em {formatDate(commitment.issueDate)}</p>
        </div>
        <div className="detail-actions">
          <button
            className={commitment.archived ? "button button-primary" : "button button-secondary"}
            type="button"
            disabled={archiveChanging}
            onClick={() => void handleArchiveChange()}
          >
            <Icon name={commitment.archived ? "restore" : "archive"} />
            {archiveChanging
              ? "Salvando…"
              : commitment.archived
                ? "Desarquivar NE"
                : "Arquivar NE"}
          </button>
          <button
            className="button button-secondary"
            type="button"
            disabled={commitment.archived}
            onClick={() => setReinforcementOpen(true)}
          >
            <Icon name="plus" />
            Reforçar empenho
          </button>
          <button
            className="button button-danger-secondary"
            type="button"
            title={commitment.balanceCents < 0 ? "Revise os pedidos e notas fiscais: a NE está com saldo financeiro negativo." : undefined}
            disabled={
              commitment.archived ||
              commitment.balanceCents < 0 ||
              (commitment.balanceCents <= 0 &&
                !commitment.items.some((item) => item.balanceQuantity > 0.000001))
            }
            onClick={() => setAnnulmentOpen(true)}
          >
            <Icon name="minus" />
            Anular empenho
          </button>
          <button
            className="button button-primary"
            type="button"
            disabled={closed || commitment.archived}
            onClick={() => setOrderOpen(true)}
          >
            <Icon name="plus" />
            Novo pedido
          </button>
        </div>
      </header>

      {commitment.archived && (
        <section className="archived-banner">
          <Icon name="archive" />
          <div>
            <strong>Esta NE está arquivada</strong>
            <p>Ela não entra na visão geral nem nas estatísticas. Desarquive para lançar pedidos, NFs, reforços ou anulações.</p>
          </div>
        </section>
      )}

      <section className="detail-finance-card">
        <div className="finance-kpi">
          <span>{commitment.reinforcementCount > 0 || commitment.annulmentCount > 0 ? "Valor autorizado" : "Valor da NE"}</span>
          <strong>{formatCurrency(commitment.totalCents)}</strong>
        </div>
        <div className="finance-kpi">
          <span>Comprometido</span>
          <strong>{formatCurrency(commitment.orderedCents)}</strong>
        </div>
        <div className="finance-kpi finance-balance">
          <span>Saldo disponível</span>
          <strong>{formatCurrency(commitment.balanceCents)}</strong>
        </div>
        <div className="finance-progress">
          <div className="progress-labels">
            <span>{rawProgress.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% do empenho utilizado</span>
            <span>{commitment.orderCount} pedido(s)</span>
          </div>
          <div className="progress-track large">
            <span className={commitment.balanceCents < 0 ? "progress-over" : ""} style={{ width: `${progress}%` }} />
          </div>
        </div>
      </section>

      {commitment.notes && (
        <section className="note-banner">
          <Icon name="clipboard" />
          <div><strong>Observação da NE</strong><p>{commitment.notes}</p></div>
        </section>
      )}

      <section className="detail-layout">
        <div className="content-card items-card">
          <div className="content-card-header compact-header">
            <div>
              <h2>Saldo por item</h2>
              <p>{filteredItems.length} de {commitment.items.length} itens</p>
            </div>
            <div className="list-tools">
              <label className="search-field compact-search">
                <Icon name="search" />
                <span className="sr-only">Buscar item</span>
                <input
                  type="search"
                  placeholder="Buscar item"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <select className="filter-select" value={filter} onChange={(event) => setFilter(event.target.value as ItemFilter)} aria-label="Filtrar itens">
                <option value="todos">Todos os itens</option>
                <option value="alertas">Acima do previsto</option>
                <option value="disponiveis">Com saldo</option>
                <option value="esgotados">Esgotados</option>
              </select>
            </div>
          </div>

          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Item / descrição</th>
                  <th>Empenhado</th>
                  <th>Considerado</th>
                  <th>Resta pedir</th>
                  <th>Preço unit.</th>
                  <th>Saldo do item</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => {
                  const negative = item.balanceQuantity < -0.000001;
                  const empty = Math.abs(item.balanceQuantity) < 0.000001;
                  return (
                    <tr className={negative ? "row-negative" : empty ? "row-empty" : ""} key={item.id}>
                      <td>
                        <div className="table-product">
                          <span className="item-number">{item.lineNumber}</span>
                          <span>
                            <strong>{item.description}</strong>
                            <small>{item.unit}</small>
                            {negative && (
                              <span className="row-limit-label">
                                <Icon name="alert" /> Limite extrapolado
                              </span>
                            )}
                            {empty && (
                              <span className="row-empty-label">
                                <Icon name="alert" /> Saldo zerado
                              </span>
                            )}
                          </span>
                        </div>
                      </td>
                      <td>{formatQuantity(item.contractedQuantity)} <small>{item.unit}</small></td>
                      <td>{formatQuantity(item.orderedQuantity)} <small>{item.unit}</small></td>
                      <td>
                        <span className={`quantity-pill ${negative ? "danger" : empty ? "neutral" : "success"}`}>
                          {formatQuantity(item.balanceQuantity)} {item.unit}
                        </span>
                      </td>
                      <td>{formatCurrency(item.unitPriceCents)}</td>
                      <td className={negative ? "negative" : ""}>{formatCurrency(item.balanceAtCommitmentPriceCents)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="content-card orders-card">
          <div className="content-card-header compact-header">
            <div><h2>Pedidos e notas fiscais</h2><p>Pedidos em aberto reservam saldo; NFs usam o valor entregue</p></div>
          </div>
          <div className="orders-list">
            {commitment.orders.length === 0 ? (
              <div className="empty-state small"><span><Icon name="package" /></span><strong>Nenhum pedido</strong><p>O saldo está integralmente disponível.</p></div>
            ) : commitment.orders.map((order) => (
              <article className="order-card" key={order.id}>
                <div className="order-card-top">
                  <span className={`order-status-icon ${order.invoice ? "faturado" : "rascunho"}`}>
                    <Icon name={order.invoice ? "receipt" : "clipboard"} />
                  </span>
                  <div>
                    <div className="order-title-line">
                      <h3>{order.invoice ? `NF ${order.invoice.number}` : order.reference}</h3>
                      {!order.invoice && (
                        <span className="badge badge-warning">Aguardando NF</span>
                      )}
                    </div>
                    <p>
                      {formatDate(order.invoice?.invoiceDate ?? order.orderDate)} · {order.invoice?.itemCount ?? order.itemCount} item(ns)
                    </p>
                  </div>
                  <button
                    className="icon-button danger-hover order-delete"
                    type="button"
                    aria-label={`Excluir ${order.reference}`}
                    disabled={deletingId === order.id || commitment.archived}
                    onClick={() => void handleDelete(order.id, order.reference)}
                  >
                    <Icon name="trash" />
                  </button>
                </div>
                <div className="order-card-value">
                  <span>{order.invoice ? "Valor da NF" : "Valor reservado"}</span>
                  <strong>{formatCurrency(order.invoice?.totalCents ?? order.requestedTotalCents)}</strong>
                </div>
                {order.hasValueAdjustment && (
                  <div className="value-adjustment">
                    <Icon name="alert" /> Valor informado difere do cálculo de {formatCurrency(order.calculatedTotalCents)}
                  </div>
                )}
                {order.notes && <p className="order-note"><strong>Pedido:</strong> {order.notes}</p>}
                {order.invoice?.notes && <p className="order-note"><strong>NF:</strong> {order.invoice.notes}</p>}
                <div className="order-card-actions">
                  <Link
                    className="button button-small button-ghost"
                    href={`/documentos/pedidos/${order.id}?print=1`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Icon name="file" /> Pedido em PDF
                  </Link>
                  {!commitment.archived && (
                    <>
                      {!order.invoice && (
                        <button className="button button-small button-ghost" type="button" onClick={() => setEditingOrderId(order.id)}>
                          <Icon name="edit" /> Editar pedido
                        </button>
                      )}
                      <button className="button button-small button-secondary" type="button" onClick={() => setInvoiceOrderId(order.id)}>
                        <Icon name="receipt" /> {order.invoice ? "Editar NF" : "Transformar em NF"}
                      </button>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
        </aside>
      </section>

      {commitment.reinforcements.length > 0 && (
        <section className="content-card reinforcement-history-card">
          <div className="content-card-header compact-header">
            <div>
              <h2>Histórico de reforços</h2>
              <p>
                {commitment.reinforcementCount} reforço(s) · {formatCurrency(commitment.reinforcementTotalCents)} acrescentados
              </p>
            </div>
          </div>
          <div className="reinforcement-history-list">
            {commitment.reinforcements.map((reinforcement) => (
              <button
                aria-haspopup="dialog"
                aria-label={`Ver itens do reforço ${reinforcement.reference}`}
                className="reinforcement-history-item"
                key={reinforcement.id}
                type="button"
                onClick={() => setSelectedReinforcementId(reinforcement.id)}
              >
                <span className="reinforcement-history-icon"><Icon name="plus" /></span>
                <span className="reinforcement-history-content">
                  <strong>{reinforcement.reference}</strong>
                  <small>{formatDate(reinforcement.reinforcementDate)} · {reinforcement.itemCount} item(ns)</small>
                  {reinforcement.notes && <p>{reinforcement.notes}</p>}
                </span>
                <span className="reinforcement-history-action">
                  <strong className="reinforcement-history-value">+ {formatCurrency(reinforcement.totalCents)}</strong>
                  <Icon name="chevron-right" />
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {commitment.annulments.length > 0 && (
        <section className="content-card reinforcement-history-card annulment-history-card">
          <div className="content-card-header compact-header">
            <div>
              <h2>Histórico de anulações</h2>
              <p>
                {commitment.annulmentCount} anulação(ões) · {formatCurrency(commitment.annulmentTotalCents)} reduzidos
              </p>
            </div>
          </div>
          <div className="reinforcement-history-list">
            {commitment.annulments.map((annulment) => (
              <button
                aria-haspopup="dialog"
                aria-label={`Ver itens da anulação ${annulment.reference}`}
                className="reinforcement-history-item annulment-history-item"
                key={annulment.id}
                type="button"
                onClick={() => setSelectedAnnulmentId(annulment.id)}
              >
                <span className="reinforcement-history-icon annulment-history-icon"><Icon name="minus" /></span>
                <span className="reinforcement-history-content">
                  <span className="annulment-history-title">
                    <strong>{annulment.reference}</strong>
                    <span className="badge badge-danger">{annulment.type === "total" ? "Total" : "Parcial"}</span>
                  </span>
                  <small>{formatDate(annulment.annulmentDate)} · {annulment.itemCount} item(ns)</small>
                  {annulment.notes && <p>{annulment.notes}</p>}
                </span>
                <span className="reinforcement-history-action">
                  <strong className="reinforcement-history-value annulment-history-value">− {formatCurrency(annulment.totalCents)}</strong>
                  <Icon name="chevron-right" />
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <NewOrderModal
        open={orderOpen || Boolean(editingOrderId)}
        commitment={commitment}
        orderId={editingOrderId}
        onClose={() => {
          setOrderOpen(false);
          setEditingOrderId(null);
        }}
        onSaved={() => {
          setOrderOpen(false);
          setEditingOrderId(null);
          void load();
        }}
      />
      <InvoiceModal
        open={Boolean(invoiceOrderId)}
        commitment={commitment}
        orderId={invoiceOrderId}
        onClose={() => setInvoiceOrderId(null)}
        onSaved={() => {
          setInvoiceOrderId(null);
          void load();
        }}
      />
      <NewReinforcementModal
        open={reinforcementOpen}
        commitment={commitment}
        onClose={() => setReinforcementOpen(false)}
        onCreated={() => {
          setReinforcementOpen(false);
          void load();
        }}
      />
      <NewAnnulmentModal
        open={annulmentOpen}
        commitment={commitment}
        onClose={() => setAnnulmentOpen(false)}
        onCreated={() => {
          setAnnulmentOpen(false);
          void load();
        }}
      />
      <ReinforcementDetailModal
        reinforcement={selectedReinforcement}
        commitmentNumber={commitment.number}
        onClose={() => setSelectedReinforcementId(null)}
      />
      <AnnulmentDetailModal
        annulment={selectedAnnulment}
        commitmentNumber={commitment.number}
        onClose={() => setSelectedAnnulmentId(null)}
      />
    </div>
  );
}
