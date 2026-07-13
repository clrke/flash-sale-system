import { useState } from 'react';
import type { ProductInfo } from '../api';

interface ProductPanelProps {
  product: ProductInfo | null;
}

/**
 * Product hero: a real product image plus name, tagline and price. Falls back
 * to a neutral placeholder block if the image fails to load or the status has
 * not arrived yet, so the layout never collapses.
 */
export function ProductPanel({ product }: ProductPanelProps) {
  const [imageFailed, setImageFailed] = useState(false);

  if (!product) {
    return (
      <div className="product-panel product-panel--loading">
        <div className="product-panel__image product-panel__image--placeholder" />
      </div>
    );
  }

  return (
    <div className="product-panel">
      <div className="product-panel__image">
        {imageFailed ? (
          <div className="product-panel__image--placeholder" aria-hidden="true" />
        ) : (
          <img
            src={product.imageUrl}
            alt={product.name}
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        )}
      </div>
      <div className="product-panel__info">
        <h2 className="product-panel__name">{product.name}</h2>
        {product.tagline && <p className="product-panel__tagline">{product.tagline}</p>}
        <p className="product-panel__price">{product.price}</p>
      </div>
    </div>
  );
}
