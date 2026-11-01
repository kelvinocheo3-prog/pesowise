import test from 'node:test';
import assert from 'node:assert/strict';
import { validAmount, sumAmounts, cashBalance, plannedBudgetTotal, budgetActual, savingsBalance, summarizeTransactions } from '../js/finance.js';

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