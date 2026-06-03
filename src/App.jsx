import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { StoreProvider } from './store/StoreContext.jsx';
import Sidebar from './components/Sidebar.jsx';
import Overview from './pages/Overview.jsx';
import ReconciliationPage from './pages/ReconciliationPage.jsx';
import BoqPage from './pages/BoqPage.jsx';
import SchedulePage from './pages/SchedulePage.jsx';
import PurchaseRequestsPage from './pages/PurchaseRequestsPage.jsx';
import SuppliersPage from './pages/SuppliersPage.jsx';
import CataloguePage from './pages/CataloguePage.jsx';

export default function App() {
  return (
    <StoreProvider>
      <BrowserRouter>
        <div className="app">
          <Sidebar />
          <main className="main">
            <Routes>
              <Route path="/" element={<Overview />} />
              <Route path="/reconciliation" element={<ReconciliationPage />} />
              <Route path="/schedule" element={<SchedulePage />} />
              <Route path="/boq" element={<BoqPage />} />
              <Route path="/purchase-requests" element={<PurchaseRequestsPage />} />
              <Route path="/suppliers" element={<SuppliersPage />} />
              <Route path="/catalogue" element={<CataloguePage />} />
              <Route path="*" element={<Overview />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </StoreProvider>
  );
}
