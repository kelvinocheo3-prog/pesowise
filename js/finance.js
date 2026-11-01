function cents(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100);
}

export function validAmount(raw) {
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 999999999999.99) return null;
  const rounded = Math.round((amount + Number.EPSILON) * 100) / 100;
  return amount === rounded ? rounded : null;
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
  return { income, expenses, net: income - expenses };
}

export function weekStartDate(date, startsOn = 1) {
  const firstDay = Number(startsOn) === 0 ? 0 : 1;
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysSinceStart = (start.getDay() - firstDay + 7) % 7;
  start.setDate(start.getDate() - daysSinceStart);
  return start;
}