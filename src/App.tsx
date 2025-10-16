
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { FeatureFlagsProvider } from "@/contexts/FeatureFlagsContext";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import Directory from "./pages/Directory";
import Engagement from "./pages/Engagement";
import Leave from "./pages/Leave";
import Recruitment from "./pages/Recruitment";
import Performance from "./pages/Performance";
import ResourceHub from "./pages/ResourceHub";
import Compensation from "./pages/Compensation";
import FeatureFlags from "./pages/FeatureFlags";
import RequireAuth from "@/components/RequireAuth";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <FeatureFlagsProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Login />} />
            <Route path="/home" element={<RequireAuth><Home /></RequireAuth>} />
            <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
            <Route path="/directory" element={<RequireAuth><Directory /></RequireAuth>} />
            <Route path="/engagement" element={<RequireAuth><Engagement /></RequireAuth>} />
            <Route path="/leave" element={<RequireAuth><Leave /></RequireAuth>} />
            <Route path="/recruitment" element={<RequireAuth><Recruitment /></RequireAuth>} />
            <Route path="/performance" element={<RequireAuth><Performance /></RequireAuth>} />
            <Route path="/resource-hub" element={<RequireAuth><ResourceHub /></RequireAuth>} />
            <Route path="/compensation" element={<RequireAuth><Compensation /></RequireAuth>} />
            <Route path="/feature-flags" element={<RequireAuth><FeatureFlags /></RequireAuth>} />
            <Route path="/index" element={<Index />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </FeatureFlagsProvider>
  </QueryClientProvider>
);

export default App;
