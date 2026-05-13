import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedShell from "@/components/ProtectedShell";
import Index from "./pages/Index";
import CaseIntelligence from "./pages/CaseIntelligence";
import EntryDetails from "./pages/EntryDetails";
import CaseLog from "./pages/CaseLog";
import Auth from "./pages/Auth";
import Account from "./pages/Account";
import CheckoutSuccess from "./pages/CheckoutSuccess";
import CheckoutCancel from "./pages/CheckoutCancel";
import NotFound from "./pages/NotFound";


const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <BrowserRouter>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/checkout/success" element={<CheckoutSuccess />} />
            <Route path="/checkout/cancel" element={<CheckoutCancel />} />

            <Route element={<ProtectedShell />}>
              <Route path="/" element={<CaseLog />} />
              <Route path="/communication-shield" element={<Index />} />
              <Route path="/case-intelligence" element={<CaseIntelligence />} />
              <Route path="/case-intelligence/entry/:entryId" element={<EntryDetails />} />
              <Route path="/account" element={<Account />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
