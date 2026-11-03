function cents(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100);
}

export function validAmount(raw) {
  const text = String(raw ?? '').trim();
  // digits only, optional thousands commas (1,250.50), max 2 decimals. Rejects 0x10, 1e2, 1,2,3.
  if (!/^(?:\d{1,3}(?:,\d{3})+|\d*)(?:\.\d{1,2})?$/.test(text)) return null;
  const amount = Number(text.replace(/,/g, ''));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 999999999999.99) return null;
  return amount;
}

export function sumAmounts(records) {
  return records.reduce((sum, record) => sum + cents(record.amount), 0) / 100;
}

export function cashBalance(transactions) {
  return transactions.reduce((sum, transaction) => {
    const sign = transaction.type === 'income' ? 1 : -1;
    return sum + sign * cents(transaction.amount);
  }, 0) / 100;
}

export function plannedBudgetTotal(budgets) {
  const overall = budgets.find(budget => !budget.category);
  return overall ? Number(overall.amount) : sumAmounts(budgets);
}

export function budgetActual(transactions, budget) {
  return sumAmounts(transactions.filter(transaction => transaction.type === 'expense'
    && transaction.date?.slice(0, 7) === budget.month
    && (!budget.category || transaction.category === budget.category)));
}

export function savingsBalance(goalId, activities) {
  return activities.filter(activity => activity.goalId === goalId).reduce((sum, activity) => {
    const sign = activity.type === 'deposit' ? 1 : -1;
    return sum + sign * cents(activity.amount);
  }, 0) / 100;
}

export function summarizeTransactions(transactions, start, end) {
  const range = transactions.filter(transaction => transaction.date >= start && transaction.date <= end);
  const income = sumAmounts(range.filter(transaction => transaction.type === 'income'));
  const expenses = sumAmounts(range.filter(transaction => transaction.type === 'expense'));
  return { income, expenses, net: subtractAmounts(income, expenses) };
}

export function weekStartDate(date, startsOn = 1) {
  const firstDay = Number(startsOn) === 0 ? 0 : 1;
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysSinceStart = (start.getDay() - firstDay + 7) % 7;
  start.setDate(start.getDate() - daysSinceStart);
  return start;
}
export function subtractAmounts(a, b) {
  return (cents(a) - cents(b)) / 100;
}

export function localDateString(date = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

// Local-calendar day offset (not UTC), so "Yesterday"/"Tomorrow" are right at any hour.
export function dayOffset(days, from = new Date()) {
  return localDateString(new Date(from.getFullYear(), from.getMonth(), from.getDate() + days));
}

// If `month` has no budgets, copy the most recent earlier month's budgets into it.
export function budgetsToCarry(budgets, month, makeId, nowIso) {
  if (budgets.some(budget => budget.month === month)) return [];
  const prior = budgets.map(budget => budget.month).filter(m => m < month).sort().pop();
  if (!prior) return [];
  return budgets.filter(budget => budget.month === prior)
    .map(budget => ({ ...budget, id: makeId(), month, createdAt: nowIso, updatedAt: nowIso }));
}
