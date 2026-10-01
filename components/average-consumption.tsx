"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/client-api";
import { formatDate, formatQuantity } from "../lib/format";
import type { ConsumptionData } from "../lib/types";
import { Icon } from "./icon";

type Period = "90d" | "30d" | "180d" | "all" | "month" | "custom";
type AppliedPeriod = { period: Period; start: string; end: string };

function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
}

function formatAverage(value: number) {
  return value > 0 && value < 0.001 ? "< 0,001" : formatQuantity(value);
}

export function AverageConsumption() {
  const [data, setData] = useState<ConsumptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [validationError, setValidationError] = useState("");
  const [query, setQuery] = useState("");
  const [draftPeriod, setDraftPeriod] = useState<Period>("90d");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [applied, setApplied] = useState<AppliedPeriod>({ period: "90d", start: "", end: "" });
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ period: applied.period });
      if (applied.period === "custom") {
        params.set("start", applied.start);
        params.set("end", applied.end);
      }
      try {
        const response = await apiFetch(`/api/consumption?${params}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = (await response.json()) as ConsumptionData | { error: string };
        if (!response.ok || !("items" in body)) {
          throw new Error("error" in body ? body.error : "Falha ao carregar o consumo médio.");
        }
        if (controller.signal.aborted) return;
        setData(body);
        setStartDate((current) => current || body.period.startDate);
        setEndDate((current) => current || body.period.endDate);
      } catch (requestError) {
        if (controller.signal.aborted) return;
        setError(requestError instanceof Error ? requestError.message : "Falha ao carregar o consumo médio.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    const timer = window.setTimeout(() => void load(), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [applied, retry]);

  const filteredItems = useMemo(() => {
    const normalized = normalizeSearch(query);
    return (data?.items ?? []).filter((item) =>
      !normalized || normalizeSearch(`${item.description} ${item.unit}`).includes(normalized),
    );
  }, [data, query]);

  const periodLabel = data
    ? `${formatDate(data.period.startDate)} a ${formatDate(data.period.endDate)}`
    : "Carregando período";

  return (
    <div className="page-wrap">
      <header className="page-header">
        <div>
          <span className="eyebrow">Planejamento</span>
          <h1>Consumo médio</h1>
          <p>Consulte a média mensal e semanal de cada item para planejar os próximos pedidos.</p>
        </div>
      </header>

      <section className="content-card consumption-filters" aria-label="Filtros de período">
        <form
          className="consumption-filter-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (draftPeriod === "custom" && (!startDate || !endDate || startDate > endDate)) {
              setValidationError("Informe um período válido: a data final deve ser igual ou posterior à inicial.");
              return;
            }
            if (draftPeriod === "custom" && data && endDate > data.today) {
              setValidationError("Escolha uma data final até hoje.");
              return;
            }
            setValidationError("");
            setApplied({ period: draftPeriod, start: startDate, end: endDate });
          }}
        >
          <label className="field consumption-period-field">
            <span>Período de análise</span>
            <select value={draftPeriod} onChange={(event) => { setDraftPeriod(event.target.value as Period); setValidationError(""); }}>
              <option value="30d">Últimos 30 dias</option>
              <option value="90d">Últimos 90 dias</option>
              <option value="180d">Últimos 180 dias</option>
              <option value="month">Mês atual</option>
              <option value="all">Todo o histórico de NFs</option>
              <option value="custom">Período personalizado</option>
            </select>
          </label>
          {draftPeriod === "custom" && (
            <>
              <label className="field consumption-date-field">
                <span>Data inicial</span>
                <input type="date" required value={startDate} max={endDate || data?.today} onChange={(event) => setStartDate(event.target.value)} />
              </label>
              <label className="field consumption-date-field">
                <span>Data final</span>
                <input type="date" required value={endDate} min={startDate || undefined} max={data?.today} onChange={(event) => setEndDate(event.target.value)} />
              </label>
            </>
          )}
          <button className="button button-primary consumption-apply" type="submit" disabled={loading}>
            {loading ? "Carregando…" : "Aplicar período"}
          </button>
        </form>
        {validationError && <p className="consumption-validation" role="alert">{validationError}</p>}
        <p className="consumption-method">Estimativa baseada nas quantidades entregues nas notas fiscais. Pedidos em aberto não entram no cálculo; NFs de NEs arquivadas também são consideradas.</p>
      </section>

      <div className="sr-only" role="status" aria-live="polite">
        {loading ? "Carregando consumo médio." : error ? "Falha ao carregar consumo médio." : `Consumo médio atualizado. ${periodLabel}.`}
      </div>

      {error ? (
        <section className="error-state" role="alert">
          <Icon name="alert" />
          <div><strong>Não foi possível carregar o consumo médio</strong><p>{error}</p></div>
          <button className="button button-secondary" type="button" onClick={() => setRetry((value) => value + 1)}>Tentar novamente</button>
        </section>
      ) : !data ? (
        <div className="skeleton-stack" aria-label="Carregando consumo médio" aria-busy="true">
          <div className="consumption-summary-grid">
            {[0, 1, 2].map((item) => <div className="skeleton summary-card" key={item} />)}
          </div>
          <div className="skeleton skeleton-panel" />
        </div>
      ) : (
        <div className={loading ? "consumption-results consumption-results-loading" : "consumption-results"} aria-busy={loading}>
          <section className="consumption-summary-grid" aria-label="Resumo do período analisado">
            <article className="summary-card summary-dark">
              <span className="summary-icon"><Icon name="package" /></span>
              <div><span>Itens com consumo</span><strong>{data.summary.consumedItemCount}</strong><small>de {data.summary.itemCount} item(ns) cadastrado(s)</small></div>
            </article>
            <article className="summary-card">
              <span className="summary-icon mint"><Icon name="receipt" /></span>
              <div><span>Notas fiscais no período</span><strong>{data.summary.invoiceCount}</strong><small>em {data.summary.commitmentCount} empenho(s)</small></div>
            </article>
            <article className="summary-card">
              <span className="summary-icon lime"><Icon name="clipboard" /></span>
              <div><span>Período analisado</span><strong>{data.period.days} dia(s)</strong><small>{periodLabel}</small></div>
            </article>
          </section>

          {data.period.days < 30 && data.summary.invoiceCount > 0 && (
            <p className="consumption-notice consumption-notice-warning"><Icon name="alert" /><span>Período com menos de 30 dias: a média mensal é uma projeção e pode variar com novas entregas.</span></p>
          )}

          <section className="content-card">
            <div className="content-card-header">
              <div>
                <h2>Consumo por item</h2>
                <p>{filteredItems.length} de {data.items.length} item(ns) · {periodLabel}</p>
              </div>
              <label className="search-field">
                <Icon name="search" />
                <span className="sr-only">Buscar item ou unidade</span>
                <input type="search" placeholder="Buscar item ou unidade" value={query} onChange={(event) => setQuery(event.target.value)} />
              </label>
            </div>

            {data.summary.invoiceCount === 0 && data.items.length > 0 && (
              <p className="consumption-notice"><Icon name="receipt" /><span>Nenhuma NF no período selecionado. As médias ficam em zero até haver entregas registradas nesse intervalo.</span></p>
            )}

            {filteredItems.length === 0 ? (
              <div className="empty-state">
                <span><Icon name={data.items.length ? "search" : "package"} /></span>
                <strong>{data.items.length ? "Nenhum item encontrado" : "Nenhum item cadastrado"}</strong>
                <p>{data.items.length ? "Ajuste a busca para localizar o item." : "Os itens aparecerão aqui após o cadastro de uma NE. Registre as notas fiscais para acompanhar as médias."}</p>
              </div>
            ) : (
              <>
              <p className="consumption-scroll-hint">Deslize a tabela para ver as médias e as demais colunas.</p>
              <div className="data-table-wrap consumption-table-wrap" role="region" aria-label="Tabela de consumo por item; role horizontalmente para ver todas as colunas" tabIndex={0}>
                <table className="data-table consumption-table">
                  <caption className="sr-only">Consumo médio de {periodLabel}. Quantidades expressas na unidade de cada item.</caption>
                  <thead>
                    <tr>
                      <th scope="col">Item / unidade</th>
                      <th scope="col">Total entregue</th>
                      <th scope="col">Média mensal<small>30 dias</small></th>
                      <th scope="col">Média semanal<small>7 dias</small></th>
                      <th scope="col">Última NF<small>No período</small></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((item) => (
                      <tr key={item.key} className={item.totalQuantity === 0 ? "consumption-row-zero" : undefined}>
                        <td><div className="consumption-product"><strong>{item.description}</strong><span>{item.unit}</span></div></td>
                        <td><span className="consumption-quantity">{formatQuantity(item.totalQuantity)} <small>{item.unit}</small></span></td>
                        <td><span className="consumption-average">{formatAverage(item.monthlyAverage)} <small>{item.unit}</small></span></td>
                        <td><span className="consumption-average">{formatAverage(item.weeklyAverage)} <small>{item.unit}</small></span></td>
                        <td><span className="consumption-invoice">{item.lastInvoiceDate ? formatDate(item.lastInvoiceDate) : "Sem entregas"}<small>{item.invoiceCount} NF(s)</small></span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            )}

            <div className="consumption-explanation">
              <p><strong>Como calculamos:</strong> total entregue ÷ {data.period.days} dia(s) do período × 30 para a média mensal, ou × 7 para a semanal. Os dias sem entrega também entram na média.</p>
              <p>Itens com o mesmo nome e unidade são agrupados entre as NEs. Unidades diferentes são exibidas separadamente. A média mensal usa um mês padrão de 30 dias.</p>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
