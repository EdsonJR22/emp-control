"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/client-api";
import { formatCurrency, formatDate } from "../lib/format";
import type { ArchivedCommitmentsData } from "../lib/types";
import { Icon } from "./icon";

export function ArchivedCommitments() {
  const [data, setData] = useState<ArchivedCommitmentsData | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await apiFetch("/api/commitments/archived", { cache: "no-store" });
      const body = (await response.json()) as ArchivedCommitmentsData | { error: string };
      if (!response.ok || !("commitments" in body)) {
        throw new Error("error" in body ? body.error : "Falha ao carregar as NEs arquivadas.");
      }
      setData(body);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Falha ao carregar as NEs arquivadas.",
      );
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    return (data?.commitments ?? []).filter(
      (commitment) =>
        !normalized ||
        commitment.number.toLocaleLowerCase("pt-BR").includes(normalized) ||
        commitment.supplier.toLocaleLowerCase("pt-BR").includes(normalized),
    );
  }, [data, query]);

  const restore = async (id: string) => {
    setRestoringId(id);
    try {
      const response = await apiFetch(`/api/commitments/${id}/archive`, {
        method: "DELETE",
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error || "Não foi possível desarquivar a NE.");
      }
      await load();
    } catch (requestError) {
      window.alert(
        requestError instanceof Error
          ? requestError.message
          : "Não foi possível desarquivar a NE.",
      );
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <div className="page-wrap">
      <header className="page-header">
        <div>
          <span className="eyebrow">Organização</span>
          <h1>NEs arquivadas</h1>
          <p>Empenhos fora da operação atual e da visão geral. Suas notas fiscais continuam no histórico de consumo médio.</p>
        </div>
        <Link className="button button-secondary" href="/">
          <Icon name="arrow-left" /> Voltar à visão geral
        </Link>
      </header>

      {error ? (
        <section className="error-state">
          <Icon name="alert" />
          <div><strong>Não foi possível abrir o arquivo</strong><p>{error}</p></div>
          <button className="button button-secondary" type="button" onClick={() => void load()}>Tentar novamente</button>
        </section>
      ) : !data ? (
        <div className="skeleton skeleton-panel" />
      ) : (
        <section className="content-card">
          <div className="content-card-header">
            <div>
              <h2>Arquivo de notas de empenho</h2>
              <p>{filtered.length} de {data.commitments.length} registro(s)</p>
            </div>
            <label className="search-field">
              <Icon name="search" />
              <span className="sr-only">Buscar NE arquivada</span>
              <input
                type="search"
                placeholder="Buscar NE ou fornecedor"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </div>

          {filtered.length === 0 ? (
            <div className="empty-state">
              <span><Icon name="archive" /></span>
              <strong>{data.commitments.length ? "Nenhuma NE encontrada" : "Nenhuma NE arquivada"}</strong>
              <p>{data.commitments.length ? "Ajuste a busca para localizar o empenho." : "As NEs arquivadas aparecerão aqui."}</p>
            </div>
          ) : (
            <div className="archived-list">
              {filtered.map((commitment) => (
                <article className="archived-row" key={commitment.id}>
                  <Link className="archived-row-link" href={`/empenhos/${commitment.id}`}>
                    <span className="commitment-icon archived-icon"><Icon name="archive" /></span>
                    <span className="archived-row-main">
                      <span className="commitment-title-line">
                        <strong>NE {commitment.number}</strong>
                        <span className="badge badge-neutral">Arquivada</span>
                      </span>
                      <small>{commitment.supplier} · Emitida em {formatDate(commitment.issueDate)}</small>
                      <small>{commitment.itemCount} itens · {commitment.orderCount} pedidos · Saldo {formatCurrency(commitment.balanceCents)}</small>
                    </span>
                    <span className="archived-row-value">
                      <small>Valor da NE</small>
                      <strong>{formatCurrency(commitment.totalCents)}</strong>
                    </span>
                  </Link>
                  <button
                    className="button button-secondary button-small"
                    type="button"
                    disabled={restoringId === commitment.id}
                    onClick={() => void restore(commitment.id)}
                  >
                    <Icon name="restore" />
                    {restoringId === commitment.id ? "Restaurando…" : "Desarquivar"}
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
