import test from 'node:test';
import assert from 'node:assert/strict';
import { validAmount, sumAmounts, cashBalance, plannedBudgetTotal, budgetActual, savingsBalance, summarizeTransactions, weekStartDate, subtractAmounts, dayOffset, budgetsToCarry } from '../js/finance.js';

test('validates positive PHP amounts to two decimal places', () => {
  assert.equal(validAmount('0.01'), 0.01);
  assert.equal(validAmount('1250.75'), 1250.75);
  assert.equal(validAmount('1.001'), null);
  assert.equal(validAmount('0'), null);
  assert.equal(validAmount('-25'), null);
});

test('sums decimal amounts without floating point drift', () => {
  assert.equal(sumAmounts([{ amount: 0.1 }, { amount: 0.2 }, { amount: 10.05 }]), 10.35);
});

test('calculates available balance from income less expenses', () => {
  assert.equal(cashBalance([
    { type: 'income', amount: 12500.25 },
    { type: 'income', amount: 0.75 },
    { type: 'expense', amount: 3500.1 }
  ]), 9000.9);
});

test('prefers overall monthly budget instead of adding it to category budgets', () => {
  assert.equal(plannedBudgetTotal([
    { month: '2026-11', category: '', amount: 20000 },
    { month: '2026-11', category: 'Food', amount: 5000 }
  ]), 20000);
  assert.equal(plannedBudgetTotal([
    { month: '2026-11', category: 'Food', amount: 5000.25 },
    { month: '2026-11', category: 'Transport', amount: 1250.5 }
  ]), 6250.75);
});

test('counts only matching month and category expenses toward a budget', () => {
  const transactions = [
    { type: 'expense', date: '2026-11-02', category: 'Food', amount: 99.95 },
    { type: 'expense', date: '2026-11-03', category: 'Transport', amount: 50 },
    { type: 'income', date: '2026-11-04', category: 'Salary', amount: 2000 },
    { type: 'expense', date: '2026-10-30', category: 'Food', amount: 800 }
  ];
  assert.equal(budgetActual(transactions, { month: '2026-11', category: 'Food' }), 99.95);
  assert.equal(budgetActual(transactions, { month: '2026-11', category: '' }), 149.95);
});

test('savings withdrawals reduce goal balance without changing transaction totals', () => {
  const activities = [
    { goalId: 'trip', type: 'deposit', amount: 5000.5 },
    { goalId: 'trip', type: 'withdrawal', amount: 125.25 },
    { goalId: 'phone', type: 'deposit', amount: 900 }
  ];
  assert.equal(savingsBalance('trip', activities), 4875.25);
  assert.equal(cashBalance([]), 0);
});

test('summarizes transactions inside an inclusive date range', () => {
  const transactions = [
    { type: 'income', date: '2026-11-01', amount: 10000 },
    { type: 'expense', date: '2026-11-15', amount: 3750.25 },
    { type: 'expense', date: '2026-11-30', amount: 0.75 },
    { type: 'income', date: '2026-12-01', amount: 500 }
  ];
  assert.deepEqual(summarizeTransactions(transactions, '2026-11-01', '2026-11-30'), {
    income: 10000,
    expenses: 3751,
    net: 6249
  });
});

test('starts weekly reports on the configured day', () => {
  const wednesday = new Date(2026, 10, 4);
  const monday = weekStartDate(wednesday, 1);
  const sunday = weekStartDate(wednesday, 0);
  assert.deepEqual([monday.getFullYear(), monday.getMonth(), monday.getDate()], [2026, 10, 2]);
  assert.deepEqual([sunday.getFullYear(), sunday.getMonth(), sunday.getDate()], [2026, 10, 1]);
});
test('rejects hex, exponent and malformed comma input; accepts grouped commas', () => {
  for (const bad of ['0x10', '1e2', '1,2,3', '5.', '.', '', '12.345']) assert.equal(validAmount(bad), null, bad);
  assert.equal(validAmount('1,250.50'), 1250.5);
  assert.equal(validAmount('.5'), 0.5);
});

test('subtracts amounts in cents', () => {
  assert.equal(subtractAmounts(0.3, 0.1), 0.2);
  assert.equal(summarizeTransactions([{ type: 'income', date: '2026-11-01', amount: 0.3 }, { type: 'expense', date: '2026-11-02', amount: 0.1 }], '2026-11-01', '2026-11-30').net, 0.2);
});

test('yesterday and tomorrow follow the local calendar, even just after midnight', () => {
  const threeAm = new Date(2026, 10, 4, 3, 0);
  assert.equal(dayOffset(-1, threeAm), '2026-11-03');
  assert.equal(dayOffset(1, threeAm), '2026-11-05');
  assert.equal(dayOffset(1, new Date(2026, 11, 31, 23, 0)), '2027-01-01');
});

test('copies last month budgets into a new month once', () => {
  const ids = ['n1', 'n2']; const makeId = () => ids.shift();
  const budgets = [{ id: 'a', month: '2026-10', category: 'Food', amount: 5000 }, { id: 'b', month: '2026-10', category: 'Housing', amount: 9000 }];
  const out = budgetsToCarry(budgets, '2026-11', makeId, 'NOW');
  assert.deepEqual(out.map(b => [b.id, b.month, b.category, b.amount]), [['n1', '2026-11', 'Food', 5000], ['n2', '2026-11', 'Housing', 9000]]);
  assert.deepEqual(budgetsToCarry([...budgets, ...out], '2026-11', makeId, 'NOW'), []);
  assert.deepEqual(budgetsToCarry([], '2026-11', makeId, 'NOW'), []);
});
