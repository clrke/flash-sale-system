import { useEffect } from 'react';
import { ProductPanel } from './components/ProductPanel';
import { SaleStatusPanel } from './components/SaleStatusPanel';
import { PurchasePanel } from './components/PurchasePanel';
import { useSaleStatus } from './hooks/useSaleStatus';
import './App.css';

function App() {
  const { status, error, refresh } = useSaleStatus();

  // Reflects the configured product in the browser tab instead of a static
  // generic title, so a screen-shared tab reads as finished, not a
  // leftover "Vite App" / bare "Flash Sale" placeholder.
  useEffect(() => {
    document.title = status?.product ? `${status.product.name} - Flash Sale` : 'Flash Sale';
  }, [status?.product]);

  return (
    <div className="page">
      <main className="card">
        <header className="card__header">
          <p className="card__eyebrow">Flash Sale</p>
          <p className="card__subtitle">One item per customer, while supplies last.</p>
        </header>

        <ProductPanel product={status?.product ?? null} />
        <SaleStatusPanel status={status} connectionError={error} />
        <PurchasePanel status={status} onPurchaseSettled={refresh} />
      </main>
    </div>
  );
}

export default App;
