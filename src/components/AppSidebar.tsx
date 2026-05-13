import { User, LogOut, ChevronLeft } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/hooks/useProfile";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";

import dufLogo from "@/assets/dufplatform.png";
import fireLogo from "@/assets/fire.png";
import commShield from "@/assets/communication_shield.png";
import commShieldSelected from "@/assets/communication_shield_selected.png";
import caseIntelligence from "@/assets/case_intelligence.png";
import caseIntelligenceSelected from "@/assets/case_intelligence_selected.png";
import caseLog from "@/assets/case_log.png";
import caseLogSelected from "@/assets/case_log_selected.png";

const navItems = [
  {
    title: "Communication Shield",
    url: "/communication-shield",
    icon: commShield,
    iconSelected: commShieldSelected,
  },
  {
    title: "Case Intelligence",
    url: "/case-intelligence",
    icon: caseIntelligence,
    iconSelected: caseIntelligenceSelected,
  },
  {
    title: "Case Log",
    url: "/",
    icon: caseLog,
    iconSelected: caseLogSelected,
  },
];

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

export function AppSidebar() {
  const { signOut } = useAuth();
  const { profile, usage, limits } = useProfile();
  const { state, toggleSidebar } = useSidebar();
  const location = useLocation();
  const isMobile = useIsMobile();
  const collapsed = state === "collapsed";

  const evidenceUsed = limits.evidence_uses_words
    ? (usage?.evidence_words_used ?? 0)
    : (usage?.evidence_analyses_used ?? 0);
  const evidenceLimit = limits.evidence_uses_words
    ? limits.evidence_words
    : limits.evidence_analyses;
  const evidenceLabel = limits.evidence_uses_words ? "Evidence Words" : "Evidence Analyses";

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <img src={collapsed ? fireLogo : dufLogo} alt="DUF Platform" className={collapsed ? "h-6 w-6 shrink-0" : "h-6 shrink-0"} />
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarMenu>
          {navItems.map((item) => {
            const isActive = location.pathname === item.url;
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton asChild>
                  <NavLink
                    to={item.url}
                    end
                    className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                    activeClassName="text-primary bg-sidebar-accent"
                  >
                    <img
                      src={isActive ? item.iconSelected : item.icon}
                      alt={item.title}
className="h-8 w-8 shrink-0"
                    />
                    {!collapsed && <span className="text-sm">{item.title}</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter className="px-2 pb-4 space-y-1">
        <button
          onClick={toggleSidebar}
          className="flex items-center gap-3 px-3 py-2 text-sidebar-foreground hover:bg-sidebar-accent rounded-md w-full transition-colors"
        >
          <ChevronLeft className={`h-5 w-5 shrink-0 transition-transform ${collapsed ? "rotate-180" : ""}`} />
          {!collapsed && <span className="text-sm">Collapse</span>}
        </button>

        <div className="h-px bg-sidebar-border mx-1" />

        {/* Usage section – mobile only */}
        {isMobile && (
          <div className="px-3 py-3 space-y-3">
            <p className="text-sm font-medium text-sidebar-foreground">Usage</p>

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Message Rewrites</p>
              <p className="text-xs">
                <span className="text-primary font-bold">{usage?.message_rewrites_used ?? 0}</span>
                <span className="text-muted-foreground">
                  {limits.unlimited_rewrites ? " / ∞" : ` / ${limits.message_rewrites}`} used
                </span>
              </p>
              {!limits.unlimited_rewrites && (
                <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${Math.min(((usage?.message_rewrites_used ?? 0) / limits.message_rewrites) * 100, 100)}%` }}
                  />
                </div>
              )}
            </div>

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{evidenceLabel}</p>
              <p className="text-xs">
                <span className="text-primary font-bold">{formatNumber(evidenceUsed)}</span>
                <span className="text-muted-foreground"> / {formatNumber(evidenceLimit)} used</span>
              </p>
              <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${Math.min((evidenceUsed / evidenceLimit) * 100, 100)}%` }}
                />
              </div>
            </div>
          </div>
        )}

        <NavLink
          to="/account"
          className="flex items-center gap-3 px-3 py-2 text-sidebar-foreground hover:bg-sidebar-accent rounded-md"
          activeClassName="text-primary"
        >
          <User className="h-5 w-5 shrink-0" />
          {!collapsed && <span className="text-sm">Account Settings</span>}
        </NavLink>

        <button
          onClick={signOut}
          className="flex items-center gap-3 px-3 py-2 text-sidebar-foreground hover:bg-sidebar-accent rounded-md w-full transition-colors"
        >
          <LogOut className="h-5 w-5 shrink-0" />
          {!collapsed && <span className="text-sm">Logout</span>}
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}
