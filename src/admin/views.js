// Aggregator: the router imports pages from here, the page modules live in
// ./pages and the shared building blocks in ./ui.js.
export { esc, layout, icon, liveUpdates } from './ui.js';
export { dashboardPage } from './pages/dashboard.js';
export { ordersPage, orderPage, invoicePage, ticketPage, picklistPage, verifyPage } from './pages/orders.js';
export { productsPage, zonesPage, couponsPage } from './pages/catalogue.js';
export { customersPage, customerPage } from './pages/customers.js';
export { statsPage } from './pages/stats.js';
export { settingsPage } from './pages/settings.js';
export { loyaltyPage, expensesPage, auditPage, broadcastPage, searchPage } from './pages/ops.js';
export { slotsPage, staffPage, subscriptionsPage, accountingPage, productPage } from './pages/shop.js';
