"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/client-api";
import { formatCurrency, formatDate } from "../lib/format";
import type { DashboardData } from "../lib/types";
import { Icon } from "./icon";
import { NewCommitmentModal } from "./new-commitment-modal";

type StatusFilter = "todas" | "ativa" | "encerrada" | "alerta";

export function Dashboard() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("todas");
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await apiFetch("/api/dashboard", { cache: "no-store" });
      const body = (await response.json()) as DashboardData | { error: string };
      if (!response.ok || !("commitments" in body)) {
        throw new Error("error" in body ? body.error : "Falha ao carregar os dados.");
      }
      setData(body);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Falha ao carregar os dados.",
      );
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    return data.commitments.filter((commitment) => {
      const matchesQuery =
        !normalized ||
        commitment.number.toLocaleLowerCase("pt-BR").includes(normalized) ||
        commitment.supplier.toLocaleLowerCase("pt-BR").includes(normalized);
      const matchesStatus =
        status === "todas" ||
        (status === "alerta"
          ? commitment.alertCount > 0
          : commitment.status === status);
      return matchesQuery && matchesStatus;
    });
  }, [data, query, status]);

  return (
    <div className="page-wrap">
      <header className="page-header">
        <div>
          <span className="eyebrow">Controle operacional</span>
          <h1>Empenhos</h1>
          <p>Acompanhe o que foi empenhado, pedido e quanto ainda pode ser utilizado.</p>
        </div>
        <button className="button button-primary" type="button" onClick={() => setModalOpen(true)}>
          <Icon name="plus" />
          Nova NE
        </button>
      </header>

      {error ? (
        <section className="error-state">
          <Icon name="alert" />
          <div>
            <strong>Não foi possível abrir o controle</strong>
            <p>{error}</p>
          </div>
          <button className="button button-secondary" type="button" onClick={() => void load()}>
            Tentar novamente
          </button>
        </section>
      ) : !data ? (
        <DashboardSkeleton />
      ) : (
        <>
          <section className="summary-grid" aria-label="Resumo financeiro">
            <article className="summary-card summary-dark">
              <span className="summary-icon"><Icon name="clipboard" /></span>
              <div>
                <span>Valor empenhado</span>
                <strong>{formatCurrency(data.summary.totalCents)}</strong>
                <small>{data.commitments.length} NEs cadastradas</small>
              </div>
            </article>
            <article className="summary-card">
              <span className="summary-icon mint"><Icon name="package" /></span>
              <div>
                <span>Total utilizado</span>
                <strong>{formatCurrency(data.summary.orderedCents)}</strong>
                <small>Pedidos e NFs lançados</small>
              </div>
            </article>
            <article className="summary-card">
              <span className="summary-icon lime"><Icon name="wallet" /></span>
              <div>
                <span>Saldo disponível</span>
                <strong>{formatCurrency(data.summary.balanceCents)}</strong>
                <small>{data.summary.activeCount} empenho(s) ativo(s)</small>
              </div>
            </article>
            <article className={`summary-card ${data.summary.alertCount ? "summary-alert" : ""}`}>
              <span className="summary-icon warning"><Icon name="alert" /></span>
              <div>
                <span>Itens em alerta</span>
                <strong>{data.summary.alertCount}</strong>
                <small>Quantidade acima do previsto</small>
              </div>
            </article>
          </section>

          <section className="content-card" id="empenhos">
            <div className="content-card-header">
              <div>
                <h2>Notas de empenho</h2>
                <p>{filtered.length} registro(s) encontrado(s)</p>
              </div>
              <div className="list-tools">
                <label className="search-field">
                  <Icon name="search" />
                  <span className="sr-only">Buscar empenho</span>
                  <input
                    type="search"
                    placeholder="Buscar NE ou fornecedor"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
                <select
                  className="filter-select"
                  aria-label="Filtrar por status"
                  value={status}
                  onChange={(event) => setStatus(event.target.value as StatusFilter)}
                >
                  <option value="todas">Todas as situações</option>
                  <option value="ativa">Ativas</option>
                  <option value="encerrada">Encerradas</option>
                  <option value="alerta">Com alerta</option>
                </select>
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="empty-state">
                <span><Icon name="search" /></span>
                <strong>Nenhum empenho encontrado</strong>
                <p>Ajuste os filtros ou cadastre uma nova NE.</p>
              </div>
            ) : (
              <div className="commitment-list">
                {filtered.map((commitment) => {
                  const rawProgress = commitment.totalCents
                    ? (commitment.orderedCents / commitment.totalCents) * 100
                    : 0;
                  const progress = Math.max(0, Math.min(100, rawProgress));
                  const closed = commitment.balanceCents <= 0 || commitment.status === "encerrada";
                  return (
                    <Link className="commitment-row" href={`/empenhos/${commitment.id}`} key={commitment.id}>
                      <div className="commitment-main">
                        <span className="commitment-icon"><Icon name="file" /></span>
                        <div>
                          <div className="commitment-title-line">
                            <h3>NE {commitment.number}</h3>
                            <span className={`badge ${closed ? "badge-neutral" : "badge-success"}`}>
                              {closed ? "Encerrada" : "Ativa"}
                            </span>
                            {commitment.alertCount > 0 && (
                              <span className="badge badge-danger">
                                {commitment.alertCount} alerta(s)
                              </span>
                            )}
                          </div>
                          <p>{commitment.supplier} · Emitida em {formatDate(commitment.issueDate)}</p>
                          <small>{commitment.itemCount} itens · {commitment.orderCount} pedidos</small>
                        </div>
                      </div>
                      <div className="commitment-progress">
                        <div className="progress-labels">
                          <span>{rawProgress.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% utilizado</span>
                          <span>Saldo {formatCurrency(commitment.balanceCents)}</span>
                        </div>
                        <div className="progress-track">
                          <span className={commitment.balanceCents < 0 ? "progress-over" : ""} style={{ width: `${progress}%` }} />
                        </div>
                      </div>
                      <div className="commitment-values">
                        <span>Valor da NE</span>
                        <strong>{formatCurrency(commitment.totalCents)}</strong>
                      </div>
                      <span className="row-arrow"><Icon name="chevron-right" /></span>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}

      <NewCommitmentModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={(id) => {
          setModalOpen(false);
          router.push(`/empenhos/${id}`);
        }}
      />
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="skeleton-stack" aria-label="Carregando dados">
      <div className="summary-grid">
        {[0, 1, 2, 3].map((item) => <div className="skeleton summary-card" key={item} />)}
      </div>
      <div className="skeleton skeleton-panel" />
    </div>
  );
}
