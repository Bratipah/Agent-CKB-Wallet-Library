import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import WalletsList from "@/pages/wallets";
import WalletDetail from "@/pages/wallet-detail";
import SafetyPage from "@/pages/safety";
import AuditPage from "@/pages/audit";
import FiberPage from "@/pages/fiber";
import DobsPage from "@/pages/dobs";
import OtxPage from "@/pages/otx";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30000 } },
});

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/wallets" component={WalletsList} />
        <Route path="/wallets/:id/safety" component={SafetyPage} />
        <Route path="/wallets/:id/audit" component={AuditPage} />
        <Route path="/wallets/:id/fiber" component={FiberPage} />
        <Route path="/wallets/:id/dobs" component={DobsPage} />
        <Route path="/wallets/:id/otx" component={OtxPage} />
        <Route path="/wallets/:id" component={WalletDetail} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
