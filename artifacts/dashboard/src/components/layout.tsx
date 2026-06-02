import React from "react";
import { useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Activity,
  Wallet,
  LayoutDashboard,
  Cpu,
} from "lucide-react";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background dark text-foreground">
        <Sidebar className="border-r border-border">
          <SidebarContent>
            <div className="px-4 py-5 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded bg-primary/20 flex items-center justify-center">
                  <Cpu className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-bold tracking-tight text-foreground">CKB Agent</p>
                  <p className="text-xs text-muted-foreground">Wallet Manager</p>
                </div>
              </div>
            </div>
            <SidebarGroup className="pt-4">
              <SidebarGroupLabel>Navigation</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={location === "/"}
                      onClick={() => setLocation("/")}
                    >
                      <LayoutDashboard className="h-4 w-4" />
                      <span>Overview</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={location.startsWith("/wallets")}
                      onClick={() => setLocation("/wallets")}
                    >
                      <Wallet className="h-4 w-4" />
                      <span>Wallets</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>
        <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <header className="flex items-center gap-2 px-6 py-3 border-b border-border bg-background/80 backdrop-blur-sm">
            <SidebarTrigger className="text-muted-foreground" />
            <Activity className="h-3 w-3 text-green-400 animate-pulse" />
            <span className="text-xs text-muted-foreground">System active</span>
          </header>
          <div className="flex-1 overflow-auto p-6 lg:p-8">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
