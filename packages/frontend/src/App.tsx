import { SaleStatusPanel } from './components/SaleStatusPanel';
import { PurchasePanel } from './components/PurchasePanel';
import { useSaleStatus } from './hooks/useSaleStatus';
import './App.css';

function App() {
  const { status, error, refresh } = useSaleStatus();

  return (
    <div className="page">
      <main className="card">
        <header className="card__header">
          <h1>Flash Sale</h1>
          <p className="card__subtitle">One item per customer, while supplies last.</p>
        </header>

        <SaleStatusPanel status={status} connectionError={error} />
        <PurchasePanel status={status} onPurchaseSettled={refresh} />
      </main>
    </div>
  );
}

export default App;
