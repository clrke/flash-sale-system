import { InMemoryInventoryStore } from '../src/inventory/InMemoryInventoryStore.js';
import { runInventoryContract } from './contract.js';

runInventoryContract('InMemoryInventoryStore', () => new InMemoryInventoryStore());
