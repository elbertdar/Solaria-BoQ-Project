import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { StoreProvider } from './store/StoreContext.jsx';
import Sidebar from './components/Sidebar.jsx';
import RequireProject from './components/RequireProject.jsx';
import SyncGate from './components/SyncGate.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import ProjectCataloguePage from './pages/ProjectCataloguePage.jsx';
import AllPurchaseRequestsPage from './pages/AllPurchaseRequestsPage.jsx';
import Overview from './pages/Overview.jsx';
import ReconciliationPage from './pages/ReconciliationPage.jsx';
import BoqPage from './pages/BoqPage.jsx';
import SchedulePage from './pages/SchedulePage.jsx';
import PurchaseRequestsPage from './pages/PurchaseRequestsPage.jsx';
import SuppliersPage from './pages/SuppliersPage.jsx';
import CataloguePage from './pages/CataloguePage.jsx';
import MaterialTypesPage from './pages/MaterialTypesPage.jsx';
import MandorsPage from './pages/MandorsPage.jsx';
import UsersPage from './pages/UsersPage.jsx';
import TrashPage from './pages/TrashPage.jsx';

export default function App() {
  return (
    <StoreProvider>
      <SyncGate>
      <BrowserRouter>
        <div className="app">
          <Sidebar />
          <main className="main">
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/projects" element={<ProjectCataloguePage />} />
              <Route path="/all-purchase-requests" element={<AllPurchaseRequestsPage />} />
              <Route path="/overview" element={<RequireProject><Overview /></RequireProject>} />
              <Route path="/reconciliation" element={<RequireProject><ReconciliationPage /></RequireProject>} />
              <Route path="/schedule" element={<RequireProject><SchedulePage /></RequireProject>} />
              <Route path="/boq" element={<RequireProject><BoqPage /></RequireProject>} />
              <Route path="/purchase-requests" element={<RequireProject><PurchaseRequestsPage /></RequireProject>} />
              <Route path="/suppliers" element={<SuppliersPage />} />
              <Route path="/catalogue" element={<CataloguePage />} />
              <Route path="/material-types" element={<MaterialTypesPage />} />
              <Route path="/mandors" element={<MandorsPage />} />
              <Route path="/users" element={<UsersPage />} />
              <Route path="/trash" element={<TrashPage />} />
              <Route path="*" element={<DashboardPage />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
      </SyncGate>
    </StoreProvider>
  );
}
