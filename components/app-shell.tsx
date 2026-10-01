"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { initials } from "../lib/format";
import { Icon } from "./icon";

function AppFooter() {
  return (
    <footer className="app-footer">
      <a
        href="https://www.instagram.com/edson_dev_/"
        target="_blank"
        rel="noopener noreferrer"
      >
        Projeto desenvolvido e mantido por: 3º SGT MACHADO
      </a>
    </footer>
  );
}

export function AppShell({
  children,
  displayName,
}: {
  children: React.ReactNode;
  displayName: string;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const inArchived = pathname.startsWith("/arquivadas");
  const inConsumption = pathname.startsWith("/consumo-medio");

  if (pathname === "/login" || pathname === "/login/") {
    return (
      <div className="login-shell">
        <main className="login-main">{children}</main>
        <AppFooter />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <button
        className="mobile-menu-button"
        type="button"
        aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
        aria-expanded={mobileOpen}
        onClick={() => setMobileOpen((value) => !value)}
      >
        <Icon name={mobileOpen ? "x" : "menu"} />
      </button>
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <Link className="brand" href="/" onClick={() => setMobileOpen(false)}>
          <span className="brand-mark" aria-hidden="true">
            <Image src="/simbolo-intendencia.svg" alt="" width={32} height={18} priority />
          </span>
          <span>
            <strong>EmpControl</strong>
            <small>Gestão de empenhos</small>
          </span>
        </Link>

        <nav className="main-nav" aria-label="Navegação principal">
          <p className="nav-label">Menu</p>
          <Link
            className={pathname === "/" ? "nav-link active" : "nav-link"}
            href="/"
            onClick={() => setMobileOpen(false)}
          >
            <Icon name="dashboard" />
            Visão geral
          </Link>
          <Link
            className={inConsumption ? "nav-link active" : "nav-link"}
            href="/consumo-medio"
            onClick={() => setMobileOpen(false)}
          >
            <Icon name="package" />
            Consumo médio
          </Link>
          <Link
            className={inArchived ? "nav-link active" : "nav-link"}
            href="/arquivadas"
            onClick={() => setMobileOpen(false)}
          >
            <Icon name="archive" />
            NEs arquivadas
          </Link>
        </nav>

        <div className="sidebar-status">
          <span className="status-dot" />
          <div>
            <strong>Dados sincronizados</strong>
            <small>Banco compartilhado</small>
          </div>
        </div>

        <div className="profile-card">
          <span className="avatar">{initials(displayName)}</span>
          <span className="profile-copy">
            <strong>{displayName}</strong>
            <small>Acesso operacional</small>
          </span>
          <form className="logout-form" action="/api/auth/logout" method="post">
            <button className="logout-button" type="submit" aria-label="Sair do sistema" title="Sair">
              <Icon name="logout" />
            </button>
          </form>
        </div>
      </aside>
      {mobileOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Fechar menu"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <div className="app-content">
        <main className="app-main">{children}</main>
        <AppFooter />
      </div>
    </div>
  );
}
