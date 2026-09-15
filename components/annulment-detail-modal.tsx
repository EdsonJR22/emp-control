"use client";

import { formatCurrency, formatDate, formatQuantity } from "../lib/format";
import type { AnnulmentSummary } from "../lib/types";
import { Icon } from "./icon";
import { Modal } from "./modal";

export function AnnulmentDetailModal({
  annulment,
  commitmentNumber,
  onClose,
}: {
  annulment: AnnulmentSummary | null;
  commitmentNumber: string;
  onClose: () => void;
}) {
  return (
    <Modal
      open={Boolean(annulment)}
      onClose={onClose}
      title={annulment?.reference ?? "Detalhes da anulação"}
      subtitle={
        annulment
          ? `NE ${commitmentNumber} · Anulação ${annulment.type} registrada em ${formatDate(annulment.annulmentDate)}`
          : undefined
      }
      size="large"
    >
      {annulment && (
        <>
          <div className="modal-body stack-lg">
            <div className="reinforcement-summary-strip annulment-summary-strip">
              <div>
                <span>Data da anulação</span>
                <strong>{formatDate(annulment.annulmentDate)}</strong>
              </div>
              <div>
                <span>Tipo / itens</span>
                <strong>{annulment.type === "total" ? "Total" : "Parcial"} · {annulment.itemCount}</strong>
              </div>
              <div>
                <span>Valor reduzido</span>
                <strong>− {formatCurrency(annulment.totalCents)}</strong>
              </div>
            </div>

            {annulment.notes && (
              <section className="reinforcement-detail-notes annulment-detail-notes">
                <span>Observações</span>
                <p>{annulment.notes}</p>
              </section>
            )}

            {annulment.hasValueAdjustment && (
              <div className="value-adjustment annulment-adjustment">
                <Icon name="alert" />
                O valor efetivamente reduzido foi {formatCurrency(annulment.totalCents)}. Pelos preços dos itens, as quantidades anuladas correspondem a {formatCurrency(annulment.calculatedTotalCents)}.
              </div>
            )}

            <section aria-labelledby="annulment-detail-items-title">
              <div className="form-section-header">
                <div>
                  <h3 id="annulment-detail-items-title">Itens anulados</h3>
                  <p>Quantidades retiradas do saldo autorizado por esta anulação.</p>
                </div>
              </div>

              {annulment.items.length > 0 ? (
                <div className="reinforcement-detail-list annulment-detail-list">
                  <div className="reinforcement-detail-head" aria-hidden="true">
                    <span>Produto</span>
                    <span>Unidade</span>
                    <span>Quantidade anulada</span>
                    <span>Preço unitário</span>
                    <span>Redução calculada</span>
                  </div>
                  {annulment.items.map((item) => (
                    <div className="reinforcement-detail-row annulment-detail-row" key={item.commitmentItemId}>
                      <div className="product-cell">
                        <span className="item-number">{item.lineNumber}</span>
                        <span>
                          <strong>{item.description}</strong>
                          <small>Item {item.lineNumber} da NE</small>
                        </span>
                      </div>
                      <div>
                        <span className="reinforcement-detail-label">Unidade</span>
                        <strong>{item.unit}</strong>
                      </div>
                      <div className="reinforcement-detail-quantity annulment-detail-quantity">
                        <span className="reinforcement-detail-label">Quantidade anulada</span>
                        <strong>− {formatQuantity(item.annulledQuantity)} {item.unit}</strong>
                      </div>
                      <div>
                        <span className="reinforcement-detail-label">Preço unitário</span>
                        <strong>{formatCurrency(item.unitPriceCents)}</strong>
                      </div>
                      <div className="reinforcement-detail-total annulment-detail-total">
                        <span className="reinforcement-detail-label">Redução calculada</span>
                        <strong>− {formatCurrency(item.annulledTotalCents)}</strong>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state small annulment-empty-detail">
                  <span><Icon name="wallet" /></span>
                  <strong>Anulação somente financeira</strong>
                  <p>Não havia quantidade positiva livre; o saldo financeiro residual foi encerrado.</p>
                </div>
              )}
            </section>
          </div>

          <footer className="modal-footer">
            <div className="modal-total annulment-modal-total">
              <span>Total reduzido da NE</span>
              <strong>− {formatCurrency(annulment.totalCents)}</strong>
            </div>
            <div className="modal-actions">
              <button className="button button-primary" type="button" onClick={onClose}>
                Fechar
              </button>
            </div>
          </footer>
        </>
      )}
    </Modal>
  );
}
