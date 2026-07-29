import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import {
  BarChart3,
  Building2,
  CreditCard,
  FileSearch,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Plus,
  Settings,
  Shield,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { ButtonLink } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getOrganizations } from "@/lib/data";

const navigation = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/new", label: "New project", icon: Plus },
  { href: "/dashboard/organization", label: "Organization", icon: Building2 },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
];

export async function AppShell({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const organizations = await getOrganizations(user.id);
  if (organizations.length === 0) redirect("/api/onboarding");
  const organization = organizations[0]!;
  const { createServerSupabaseClient } = await import("@/lib/supabase/server");
  const supabase = await createServerSupabaseClient();
  const { data: profile } = await supabase!.from("users").select("is_platform_admin").eq("id", user.id).maybeSingle();

  return (
    <div className="app-layout">
      <aside className="app-sidebar">
        <div className="app-sidebar-brand"><Logo /></div>
        <div className="org-switcher">
          <span className="org-avatar">{organization.name.slice(0, 1).toUpperCase()}</span>
          <span><strong>{organization.name}</strong><small>{organization.role}</small></span>
        </div>
        <nav className="app-nav" aria-label="Workspace navigation">
          {navigation.map(({ href, label, icon: Icon }) => (
            <Link href={href} key={href}><Icon size={17} /> {label}</Link>
          ))}
        </nav>
        <div className="app-sidebar-section">
          <p>Workspace</p>
          <Link href="/dashboard"><FolderKanban size={16} /> Projects</Link>
          <Link href="/dashboard"><FileSearch size={16} /> Reports</Link>
          <Link href="/dashboard"><BarChart3 size={16} /> Comparisons</Link>
          {profile?.is_platform_admin && <Link href="/dashboard/admin"><Shield size={16} /> Platform admin</Link>}
        </div>
        <div className="app-sidebar-bottom">
          <Link href="/security"><Shield size={16} /> Security model</Link>
          <Link href="/dashboard/organization"><Settings size={16} /> Settings</Link>
          <form action="/auth/signout" method="post">
            <button type="submit"><LogOut size={16} /> Sign out</button>
          </form>
        </div>
      </aside>
      <div className="app-main">
        <header className="app-topbar">
          <div>
            <span className="mobile-brand"><Logo compact /></span>
            <span className="environment-pill"><span /> Production workspace</span>
          </div>
          <ButtonLink href="/dashboard/new" size="small"><Plus size={15} /> New project</ButtonLink>
        </header>
        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}
