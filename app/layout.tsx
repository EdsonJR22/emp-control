import type { Metadata } from "next";
import { cookies } from "next/headers";
import { AppShell } from "../components/app-shell";
import { AuthConfigurationError, getSessionFromToken } from "../lib/auth";
import { AUTH_COOKIE_NAME } from "../lib/auth-core";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");

export const metadata: Metadata = {
  ...(siteUrl ? { metadataBase: new URL(siteUrl) } : {}),
  title: {
    default: "EmpControl · Controle de Empenhos",
    template: "%s · EmpControl",
  },
  description:
    "Controle de notas de empenho, pedidos, quantidades e saldos.",
  openGraph: {
    type: "website",
    locale: "pt_BR",
    ...(siteUrl ? { url: siteUrl } : {}),
    siteName: "EmpControl",
    title: "EmpControl · Controle de Empenhos",
    description: "Pedidos, saldos e NEs sob controle.",
    ...(siteUrl
      ? {
          images: [
            {
              url: `${siteUrl}/og.png`,
              width: 1536,
              height: 1024,
              alt: "Controle de Empenhos",
            },
          ],
        }
      : {}),
  },
  twitter: {
    card: "summary_large_image",
    title: "EmpControl · Controle de Empenhos",
    description: "Pedidos, saldos e NEs sob controle.",
    ...(siteUrl ? { images: [`${siteUrl}/og.png`] } : {}),
  },
  icons: {
    icon: "/simbolo-intendencia.svg",
    shortcut: "/simbolo-intendencia.svg",
  },
};

async function getDisplayName() {
  const cookieStore = await cookies();
  try {
    const session = await getSessionFromToken(
      cookieStore.get(AUTH_COOKIE_NAME)?.value,
    );
    return session?.username ?? "Usuário";
  } catch (error) {
    if (error instanceof AuthConfigurationError) return "Usuário";
    throw error;
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const displayName = await getDisplayName();
  return (
    <html lang="pt-BR">
      <body>
        <AppShell displayName={displayName}>{children}</AppShell>
      </body>
    </html>
  );
}
