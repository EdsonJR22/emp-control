"use client";

import { useMemo, useState } from "react";
import { apiFetch } from "../lib/client-api";
import { formatCurrency, formatQuantity, todayIso } from "../lib/format";
import type {
  AnnulmentType,
  ApiErrorBody,
  CommitmentDetail,
  CreateAnnulmentPayload,
} from "../lib/types";
import { Icon } from "./icon";
import { Modal } from "./modal";

const QUANTITY_EPSILON = 0.000001;

export function NewAnnulmentModal({
  open,
  commitment,
  onClose,
  onCreated,
}: {
  open: boolean;
  commitment: CommitmentDetail;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [type, setType] = useState<AnnulmentType>("parcial");
  const [reference, setReference] = useState("");
  const [annulmentDate, setAnnulmentDate] = useState(todayIso());
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [totalConfirmed, setTotalConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedItems = useMemo(
    () =>
      commitment.items
        .map((item) => ({
          item,
          annulledQuantity: type === "total"
            ? Math.max(item.balanceQuantity, 0)
            : Math.max(Number(quantities[item.id]) || 0, 0),
        }))
        .filter(({ annulledQuantity }) => annulledQuantity > QUANTITY_EPSILON),
    [commitment.items, quantities, type],
  );

  const calculatedTotalCents = useMemo(
    () =>
      selectedItems.reduce(
        (sum, { item, annulledQuantity }) =>
          sum + Math.round(annulledQuantity * item.unitPriceCents),
        0,
      ),
    [selectedItems],
  );
  const effectiveTotalCents = type === "total"
    ? Math.max(commitment.balanceCents, 0)
    : calculatedTotalCents;
  const hasAdjustedTotal = calculatedTotalCents !== effectiveTotalCents;
  const exceedsItemBalance = selectedItems.some(
    ({ item, annulledQuantity }) =>
      annulledQuantity > item.balanceQuantity + QUANTITY_EPSILON,
  );
  const exceedsFinancialBalance =
    type === "parcial" && effectiveTotalCents > commitment.balanceCents;
  const hasNegativeFinancialBalance = commitment.balanceCents < 0;
  const hasAnyBalance =
    !hasNegativeFinancialBalance &&
    (commitment.balanceCents > 0 ||
      commitment.items.some((item) => item.balanceQuantity > QUANTITY_EPSILON));

  const filteredItems = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase("pt-BR");
    if (type === "total" || !normalized) return commitment.items;
    return commitment.items.filter(
      (item) =>
        item.description.toLocaleLowerCase("pt-BR").includes(normalized) ||
        String(item.lineNumber).includes(normalized),
    );
  }, [commitment.items, search, type]);

  const reset = () => {
    setType("parcial");
    setReference("");
    setAnnulmentDate(todayIso());
    setNotes("");
    setSearch("");
    setQuantities({});
    setTotalConfirmed(false);
    setError("");
  };

  const close = () => {
    if (saving) return;
    reset();
    onClose();
  };

  const changeType = (nextType: AnnulmentType) => {
    setType(nextType);
    setTotalConfirmed(false);
    setError("");
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    const payload: CreateAnnulmentPayload = {
      type,
      reference,
      annulmentDate,
      notes,
      items: type === "parcial"
        ? selectedItems.map(({ item, annulledQuantity }) => ({
            commitmentItemId: item.id,
            annulledQuantity,
          }))
        : [],
    };

    setSaving(true);
    try {
      const response = await apiFetch(
        `/api/commitments/${commitment.id}/annulments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const body = (await response.json()) as
        | { annulment: { id: string } }
        | ApiErrorBody;
      if (!response.ok || !("annulment" in body)) {
        throw new Error(
          "error" in body ? body.error : "Não foi possível registrar a anulação.",
        );
      }
      reset();
      onCreated();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Não foi possível registrar a anulação.",
      );
    } finally {
      setSaving(false);
    }
  };

  const submitDisabled =
    saving ||
    !hasAnyBalance ||
    exceedsItemBalance ||
    exceedsFinancialBalance ||
    (type === "parcial" && selectedItems.length === 0) ||
    (type === "total" && !totalConfirmed);

  return (
    <Modal
      open={open}
      onClose={close}
      title={`Anular NE ${commitment.number}`}
      subtitle="Reduza o saldo autorizado sem alterar os pedidos e notas fiscais já registrados."
      size="wide"
    >
      <form onSubmit={handleSubmit}>
        <div className="modal-body stack-lg">
          <fieldset className="annulment-type-fieldset">
            <legend>Tipo de anulação</legend>
            <div className="annulment-type-options">
              <label className={type === "parcial" ? "selected" : ""}>
                <input
                  type="radio"
                  name="annulment-type"
                  value="parcial"
                  checked={type === "parcial"}
                  onChange={() => changeType("parcial")}
                />
                <span className="annulment-type-icon"><Icon name="minus" /></span>
                <span>
                  <strong>Anulação parcial</strong>
                  <small>Escolha alguns itens ou apenas parte das quantidades.</small>
                </span>
              </label>
              <label className={type === "total" ? "selected" : ""}>
                <input
                  type="radio"
                  name="annulment-type"
                  value="total"
                  checked={type === "total"}
                  onChange={() => changeType("total")}
                />
                <span className="annulment-type-icon"><Icon name="alert" /></span>
                <span>
                  <strong>Anulação total</strong>
                  <small>Anule todo o saldo ainda disponível e encerre a NE.</small>
                </span>
              </label>
            </div>
          </fieldset>

          <div className="form-grid reinforcement-form-grid">
            <label className="field">
              <span>Documento ou referência <small>opcional</small></span>
              <input
                placeholder="Ex.: Termo de anulação 01/2026"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
              />
              <small className="field-help">Se ficar vazio, o sistema identifica pela data.</small>
            </label>
            <label className="field">
              <span>Data da anulação</span>
              <input
                required
                type="date"
                value={annulmentDate}
                onChange={(event) => setAnnulmentDate(event.target.value)}
              />
            </label>
          </div>

          <div className="reinforcement-summary-strip annulment-summary-strip">
            <div>
              <span>Valor autorizado atual</span>
              <strong>{formatCurrency(commitment.totalCents)}</strong>
            </div>
            <div>
              <span>Valor desta anulação</span>
              <strong>− {formatCurrency(effectiveTotalCents)}</strong>
            </div>
            <div>
              <span>Novo valor autorizado</span>
              <strong>{formatCurrency(commitment.totalCents - effectiveTotalCents)}</strong>
            </div>
          </div>
          <span className="sr-only" aria-live="polite">
            Valor da anulação: {formatCurrency(effectiveTotalCents)}. Novo valor autorizado: {formatCurrency(commitment.totalCents - effectiveTotalCents)}.
          </span>

          <div className="annulment-warning" id="annulment-preservation-warning">
            <Icon name="alert" />
            <div>
              <strong>Pedidos e notas fiscais não serão alterados</strong>
              <p>A anulação reduz somente as quantidades e o valor que ainda estão livres nesta NE.</p>
            </div>
          </div>

          {hasAdjustedTotal && type === "total" && (
            <div className="value-adjustment annulment-adjustment">
              <Icon name="alert" />
              O valor financeiro disponível é {formatCurrency(effectiveTotalCents)}, enquanto as quantidades somam {formatCurrency(calculatedTotalCents)} pelos preços da NE. O sistema encerrará ambos os saldos corretamente.
            </div>
          )}
          {hasNegativeFinancialBalance && (
            <div className="form-error" role="alert">
              <Icon name="alert" />A NE está com saldo financeiro negativo. Revise os pedidos e notas fiscais antes de registrar uma anulação.
            </div>
          )}

          <div className="form-section-header">
            <div>
              <h3>{type === "total" ? "Saldo que será totalmente anulado" : "Quantidades a anular"}</h3>
              <p>
                {type === "total"
                  ? "As quantidades livres são calculadas novamente pelo sistema ao confirmar."
                  : "Informe uma quantidade igual ou menor que o saldo disponível de cada item."}
              </p>
            </div>
            {type === "parcial" && (
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
            )}
          </div>

          <div className="reinforcement-item-list annulment-item-list">
            <div className="reinforcement-item-head">
              <span>Produto</span>
              <span>Autorizado atual</span>
              <span>Saldo disponível</span>
              <span>Anular em</span>
              <span>Saldo após</span>
            </div>
            {filteredItems.map((item) => {
              const availableQuantity = Math.max(
                Number(item.balanceQuantity.toFixed(3)),
                0,
              );
              const annulledQuantity = type === "total"
                ? availableQuantity
                : Math.max(Number(quantities[item.id]) || 0, 0);
              const exceeded = item.balanceQuantity < -QUANTITY_EPSILON;
              const empty = Math.abs(item.balanceQuantity) <= QUANTITY_EPSILON;
              const invalid = annulledQuantity > availableQuantity + QUANTITY_EPSILON;
              const disabled = type === "total" || availableQuantity <= QUANTITY_EPSILON;
              return (
                <div
                  className={`reinforcement-item-row annulment-item-row ${exceeded ? "exceeded" : ""} ${empty ? "empty" : ""} ${annulledQuantity > QUANTITY_EPSILON ? "selected" : ""} ${invalid ? "invalid" : ""}`}
                  key={item.id}
                >
                  <div className="product-cell">
                    <span className="item-number">{item.lineNumber}</span>
                    <span>
                      <strong>{item.description}</strong>
                      <small>{formatCurrency(item.unitPriceCents)} / {item.unit}</small>
                      {exceeded && <span className="annulment-item-state danger">Limite extrapolado</span>}
                      {empty && <span className="annulment-item-state neutral">Saldo zerado</span>}
                    </span>
                  </div>
                  <div>
                    <strong>{formatQuantity(item.contractedQuantity)}</strong>
                    <small>{item.unit}</small>
                  </div>
                  <div className={exceeded ? "negative" : ""}>
                    <strong>{formatQuantity(item.balanceQuantity)}</strong>
                    <small>{item.unit}</small>
                  </div>
                  <label>
                    <span className="mobile-field-label">Quantidade a anular</span>
                    <input
                      aria-label={`Quantidade a anular de ${item.description}`}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      max={availableQuantity}
                      step="0.001"
                      placeholder={availableQuantity > QUANTITY_EPSILON ? "0" : "Sem saldo"}
                      disabled={disabled}
                      aria-invalid={invalid}
                      aria-describedby={invalid ? `annulment-item-error-${item.id}` : undefined}
                      value={type === "total" ? availableQuantity : (quantities[item.id] ?? "")}
                      onChange={(event) =>
                        setQuantities((current) => ({
                          ...current,
                          [item.id]: event.target.value,
                        }))
                      }
                    />
                    {invalid && (
                      <span className="sr-only" id={`annulment-item-error-${item.id}`}>
                        A quantidade ultrapassa o saldo disponível deste item.
                      </span>
                    )}
                  </label>
                  <div className="reinforced-total annulled-balance">
                    <strong>{formatQuantity(item.balanceQuantity - annulledQuantity)}</strong>
                    <small>{item.unit}</small>
                  </div>
                </div>
              );
            })}
          </div>

          {exceedsItemBalance && (
            <div className="form-error" role="alert"><Icon name="alert" />Uma quantidade informada ultrapassa o saldo disponível do item.</div>
          )}
          {exceedsFinancialBalance && (
            <div className="form-error" role="alert"><Icon name="alert" />O valor da anulação ultrapassa o saldo financeiro de {formatCurrency(commitment.balanceCents)}.</div>
          )}

          {type === "total" && (
            <label className="annulment-confirmation">
              <input
                type="checkbox"
                checked={totalConfirmed}
                aria-describedby="annulment-preservation-warning"
                onChange={(event) => setTotalConfirmed(event.target.checked)}
              />
              <span>
                <strong>Confirmo a anulação de todo o saldo disponível</strong>
                <small>A NE será encerrada após este registro.</small>
              </span>
            </label>
          )}

          <label className="field">
            <span>Observações <small>opcional</small></span>
            <textarea
              rows={2}
              placeholder="Registre o motivo ou outras informações do documento de anulação."
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
          {error && <div className="form-error" role="alert"><Icon name="alert" />{error}</div>}
        </div>

        <footer className="modal-footer">
          <div className="modal-total annulment-modal-total">
            <span>Redução no valor da NE</span>
            <strong>− {formatCurrency(effectiveTotalCents)}</strong>
          </div>
          <div className="modal-actions">
            <button className="button button-ghost" type="button" disabled={saving} onClick={close}>Cancelar</button>
            <button
              className="button button-danger"
              type="submit"
              disabled={submitDisabled}
            >
              <Icon name="minus" />
              {saving ? "Registrando…" : "Registrar anulação"}
            </button>
          </div>
        </footer>
      </form>
    </Modal>
  );
}
