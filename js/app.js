import {
  initializeDatabase, getAll, getById, putRecord, deleteRecord,
  getSetting, setSetting
} from './database.js';
import { validAmount, sumAmounts, cashBalance, plannedBudgetTotal, budgetActual, savingsBalance, summarizeTransactions, weekStartDate } from './finance.js';

const app = document.querySelector('#app');
const dialogRoot = document.querySelector('#dialog-root');
const toastRegion = document.querySelector('#toast-region');
const APP_VERSION = '1.0.0';
const state = { page: 'dashboard', renderedPage: null, data: { transactions: [], budgets: [], savingsGoals: [], savingsActivities: [], categories: [], savingsLinked: false }, installPrompt: null, serviceWorkerRegistration: null, report: { start: '', end: '' } };
const expenseDefaults = ['Food', 'Transportation', 'Housing', 'Utilities', 'Shopping', 'Healthcare', 'Education', 'Entertainment', 'Personal Care', 'Family', 'Other'];
const incomeDefaults = ['Salary', 'Business', 'Freelance', 'Allowance', 'Investment', 'Gifts', 'Other'];
const budgetTemplates = {
  student: { label: 'Student', description: 'Plan for school costs, meals, travel, and personal spending.', categories: ['Education', 'Food', 'Transportation', 'Utilities', 'Entertainment'] },
  household: { label: 'Household', description: 'Organize shared home, grocery, family, and health costs.', categories: ['Housing', 'Food', 'Utilities', 'Family', 'Healthcare', 'Transportation', 'Education'] },
  flexible: { label: 'Variable income', description: 'Prioritize essentials when income changes month to month.', categories: ['Housing', 'Food', 'Utilities', 'Transportation', 'Healthcare', 'Other'] }
};
const chartColors = ['#7657d8', '#4ba98d', '#e4a344', '#db718e', '#718bd4', '#9c78c2', '#75a9b0', '#d08061', '#95a95f', '#b3829c'];
const moneyFormat = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 });
const dateFormat = new Intl.DateTimeFormat('en-PH', { day: '2-digit', month: 'short', year: 'numeric' });

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function iconSvg(name, className = '', size = 24) {
  return `<svg class="icon ${className}" width="${size}" height="${size}" aria-hidden="true" focusable="false"><use href="./assets/lucide-sprite.svg#${escapeHtml(name)}"></use></svg>`;
}

function money(value) {
  return moneyFormat.format(Number(value) || 0);
}

function localDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function displayDate(value) {
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? 'Invalid date' : dateFormat.format(date);
}

function id() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toast(message, type = 'success') {
  const item = document.createElement('div');
  item.className = `toast ${type === 'error' ? 'error' : ''}`;
  item.textContent = message;
  toastRegion.append(item);
  window.setTimeout(() => item.remove(), 3400);
}

async function loadData() {
  const names = ['transactions', 'budgets', 'savingsGoals', 'savingsActivities', 'categories'];
  const entries = await Promise.all(names.map(async name => [name, await getAll(name)]));
  state.data = Object.fromEntries(entries);
  const [savingsLinked, budgetAlertThreshold, weekStartsOn] = await Promise.all([
    getSetting('savingsLinked', false),
    getSetting('budgetAlertThreshold', 80),
    getSetting('weekStartsOn', 1)
  ]);
  Object.assign(state.data, { savingsLinked, budgetAlertThreshold, weekStartsOn });
}

function pageHeading(eyebrow, title, subtitle, actions = '') {
  document.querySelector('#page-eyebrow').textContent = eyebrow;
  document.querySelector('#page-title').textContent = title;
  document.querySelector('#page-subtitle').textContent = subtitle;
  const installAction = state.installPrompt && state.page !== 'settings'
    ? `<button class="button primary" type="button" data-action="install-app" aria-label="Install PesoWise" title="Install PesoWise">${iconSvg('download', 'button-icon', 18)}<span class="button-label">Install app</span></button>`
    : '';
  document.querySelector('#page-actions').innerHTML = `${actions}${installAction}`;
  return '';
}

function emptyState(icon, title, message, action = '') {
  return `<div class="empty-state"><div><div class="empty-mark">${icon}</div><h3>${title}</h3><p>${message}</p>${action}</div></div>`;
}

function addButton(label, kind, icon = 'plus') {
  return `<button type="button" class="button primary" data-action="add-${kind}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">${iconSvg(icon, 'button-icon', 18)}<span class="button-label">${escapeHtml(label)}</span></button>`;
}

function totalOf(records, predicate = () => true) {
  return sumAmounts(records.filter(predicate));
}

function transactionsForMonth(month) {
  return state.data.transactions.filter(record => record.date?.slice(0, 7) === month);
}

function currentStats() {
  const currentMonthTransactions = transactionsForMonth(monthKey());
  const income = totalOf(state.data.transactions, row => row.type === 'income');
  const expenses = totalOf(state.data.transactions, row => row.type === 'expense');
  const monthIncome = totalOf(currentMonthTransactions, row => row.type === 'income');
  const monthExpenses = totalOf(currentMonthTransactions, row => row.type === 'expense');
  const monthBudgets = state.data.budgets.filter(row => row.month === monthKey());
  const budgetTotal = plannedBudgetTotal(monthBudgets);
  return { income, expenses, balance: cashBalance(state.data.transactions), monthIncome, monthExpenses, budgetTotal, monthBudgets };
}

function sumGoalBalances() {
  return state.data.savingsGoals.reduce((sum, goal) => sum + savingsBalance(goal.id, state.data.savingsActivities), 0);
}

function chartCanvas(idValue, label) {
  return `<div class="chart-wrap"><canvas id="${idValue}" role="img" aria-label="${label}"></canvas></div>`;
}

function renderDashboard() {
  const stats = currentStats();
  const spent = stats.monthExpenses;
  const remaining = Math.max(0, stats.budgetTotal - spent);
  const utilization = stats.budgetTotal ? Math.round((spent / stats.budgetTotal) * 100) : 0;
  const recent = [...state.data.transactions].sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt).slice(0, 5);
  const spendByCategory = state.data.transactions.filter(row => row.type === 'expense' && row.date?.slice(0, 7) === monthKey()).reduce((map, row) => map.set(row.category, (map.get(row.category) || 0) + Number(row.amount)), new Map());
  const categories = [...spendByCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const alertThreshold = Number(state.data.budgetAlertThreshold) || 80;
  const alert = stats.budgetTotal && utilization >= alertThreshold
    ? `<div class="notice ${utilization >= 100 ? 'danger' : ''}">${iconSvg(utilization >= 100 ? 'circle-alert' : 'trending-up', 'notice-icon', 20)}<span>${utilization >= 100 ? 'Your expenses are over this month’s budget.' : `You have used ${utilization}% of this month’s budget.`} ${money(remaining)} remaining.</span></div>`
    : '';
  const actions = `${addButton('Add income', 'transaction-income', 'trending-up')} ${addButton('Add expense', 'transaction-expense', 'trending-down')} ${addButton('Create budget', 'budget', 'wallet')} ${addButton('Add savings', 'savings', 'piggy-bank')} <a class="button" href="#reports" data-page="reports" aria-label="View reports" title="View reports">${iconSvg('chart-no-axes-column-increasing', 'button-icon', 18)}<span class="button-label">View reports</span></a>`;
  app.innerHTML = `${pageHeading('YOUR FINANCES', 'Good money habits start here.', 'A clear view of your finances, saved privately on this device.', actions)}
    ${alert ? `<div style="margin-bottom:13px">${alert}</div>` : ''}
    <div class="overview-grid">
      <article class="card metric-card"><div class="metric-label">${iconSvg('wallet', 'metric-icon', 20)}Available balance</div><div class="metric-value">${money(stats.balance)}</div><div class="metric-foot">Income minus expenses, all time</div></article>
      <article class="card metric-card"><div class="metric-label">${iconSvg('trending-up', 'metric-icon income-icon', 20)}Total income</div><div class="metric-value">${money(stats.income)}</div><div class="metric-foot">${money(stats.monthIncome)} this month</div></article>
      <article class="card metric-card"><div class="metric-label">${iconSvg('trending-down', 'metric-icon expense-icon', 20)}Total expenses</div><div class="metric-value">${money(stats.expenses)}</div><div class="metric-foot">${money(stats.monthExpenses)} this month</div></article>
      <article class="card metric-card"><div class="metric-label">${iconSvg('piggy-bank', 'metric-icon', 20)}Total savings</div><div class="metric-value">${money(sumGoalBalances())}</div><div class="metric-foot">Across ${state.data.savingsGoals.length} active goal${state.data.savingsGoals.length === 1 ? '' : 's'}</div></article>
    </div>
    <div class="section-row"><h2>Monthly overview</h2><a class="text-link" href="#reports" data-page="reports">Full reports ${iconSvg('arrow-up-right', 'inline-icon', 14)}</a></div>
    <div class="chart-grid"><article class="card chart-card"><div class="chart-title"><div><h3>Income vs expenses</h3><p>${new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric' }).format(new Date())}</p></div><div class="legend"><span><i></i>Income</span><span><i class="legend-expense"></i>Expenses</span></div></div>${chartCanvas('dashboard-bars', 'Monthly income compared with expenses')}</article>
    <article class="card chart-card"><div class="chart-title"><div><h3>Spending by category</h3><p>Expense transactions this month</p></div></div>${categories.length ? `<div class="category-list">${categories.map(([name, value], index) => `<div class="category-line"><div class="category-name"><span class="category-dot" style="background:${chartColors[index % chartColors.length]}"></span>${escapeHtml(name)}</div><div class="category-total">${money(value)}</div><div class="progress-track"><div class="progress-fill" style="width:${Math.max(3, value / categories[0][1] * 100)}%;background:${chartColors[index % chartColors.length]}"></div></div></div>`).join('')}</div>` : emptyState(iconSvg('chart-pie', 'empty-icon'), 'No spending recorded', 'Add an expense to see your category breakdown.')}</article></div>
    <div class="section-row"><h2>Budget this month</h2><a class="text-link" href="#budgets" data-page="budgets">Manage budgets ${iconSvg('arrow-up-right', 'inline-icon', 14)}</a></div>
    <article class="card budget-card"><div class="budget-top"><div><strong>${stats.budgetTotal ? `${money(spent)} spent` : 'No budget set yet'}</strong><small>${stats.budgetTotal ? `${utilization}% of ${money(stats.budgetTotal)} monthly budget` : 'Set a monthly budget to keep spending on track.'}</small></div><div class="budget-numbers"><strong>${money(remaining)}</strong><br>remaining</div></div><div class="budget-meter"><span class="${utilization >= 100 ? 'over' : utilization >= 80 ? 'warn' : ''}" style="width:${Math.min(100, utilization)}%"></span></div><div class="budget-bottom"><span>${money(spent)} used</span><span>${money(stats.budgetTotal)} total</span></div></article>
    <div class="section-row"><h2>Recent transactions</h2><a class="text-link" href="#transactions" data-page="transactions">All transactions ${iconSvg('arrow-up-right', 'inline-icon', 14)}</a></div>
    ${recent.length ? `<article class="card recent-card"><div class="recent-head"><span>Description</span><span>Category</span><span>Date</span><span style="text-align:right">Amount</span><span></span></div>${recent.map(transactionRow).join('')}</article>` : `<article class="card">${emptyState(iconSvg('arrow-left-right', 'empty-icon'), 'No transactions yet', 'Add your first income or expense to see your activity here.', addButton('Add transaction', 'transaction', 'plus'))}</article>`}`;
  drawBarChart(document.querySelector('#dashboard-bars'), [stats.monthIncome], [stats.monthExpenses], ['This month']);
}

function transactionRow(record) {
  return `<div class="table-row"><div class="transaction-title">${iconSvg(record.type === 'income' ? 'trending-up' : 'trending-down', `transaction-symbol ${record.type}`, 20)}<span><strong>${escapeHtml(record.description)}</strong><small>${record.type === 'income' ? 'Income' : 'Expense'}</small></span></div><span class="muted">${escapeHtml(record.category)}</span><span class="muted">${displayDate(record.date)}</span><span class="amount ${record.type}">${record.type === 'income' ? '+' : '−'}${money(record.amount)}</span><button class="icon-action" type="button" aria-label="View transaction" data-action="view-transaction" data-id="${escapeHtml(record.id)}">${iconSvg('chevron-right', '', 18)}</button></div>`;
}

function categoryOptions(kind, selected = '') {
  const categories = state.data.categories.filter(category => category.kind === kind).sort((a, b) => a.name.localeCompare(b.name));
  return categories.map(category => `<option value="${escapeHtml(category.name)}" ${category.name === selected ? 'selected' : ''}>${escapeHtml(category.name)}</option>`).join('');
}

function renderTransactions() {
  const url = new URLSearchParams(location.hash.split('?')[1] || '');
  const search = (document.querySelector('#transaction-search')?.value || url.get('q') || '').toLowerCase();
  const type = document.querySelector('#transaction-type')?.value || 'all';
  const category = document.querySelector('#transaction-category')?.value || 'all';
  const from = document.querySelector('#transaction-from')?.value || '';
  const sort = document.querySelector('#transaction-sort')?.value || 'newest';
  let rows = [...state.data.transactions].filter(record => {
    return (!search || `${record.description} ${record.notes || ''} ${record.category}`.toLowerCase().includes(search))
      && (type === 'all' || record.type === type)
      && (category === 'all' || record.category === category)
      && (!from || record.date >= from) && record.date <= localDate();
  });
  rows.sort((a, b) => sort === 'oldest' ? a.date.localeCompare(b.date) : sort === 'amount-high' ? b.amount - a.amount : sort === 'amount-low' ? a.amount - b.amount : b.date.localeCompare(a.date));
  const selectedKind = type === 'all' ? null : type;
  const categoryList = state.data.categories.filter(item => !selectedKind || item.kind === selectedKind);
  const categoriesMarkup = categoryList.map(item => `<option value="${escapeHtml(item.name)}" ${category === item.name ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('');
  app.innerHTML = `${pageHeading('ACTIVITY', 'Transactions', 'Every entry stays on this device and can be edited at any time.', addButton('Add transaction', 'transaction'))}
    <div class="filter-bar"><input class="field-control filter-search" id="transaction-search" type="search" placeholder="Search description or notes" value="${escapeHtml(search)}" aria-label="Search transactions"><select class="field-control" id="transaction-type" aria-label="Filter by type"><option value="all">All types</option><option value="income" ${type === 'income' ? 'selected' : ''}>Income</option><option value="expense" ${type === 'expense' ? 'selected' : ''}>Expense</option></select><select class="field-control" id="transaction-category" aria-label="Filter by category"><option value="all">All categories</option>${categoriesMarkup}</select><input class="field-control" id="transaction-from" type="date" max="${localDate()}" aria-label="From date through today" value="${escapeHtml(from)}"><select class="field-control" id="transaction-sort" aria-label="Sort transactions"><option value="newest" ${sort === 'newest' ? 'selected' : ''}>Newest first</option><option value="oldest" ${sort === 'oldest' ? 'selected' : ''}>Oldest first</option><option value="amount-high" ${sort === 'amount-high' ? 'selected' : ''}>Amount: high to low</option><option value="amount-low" ${sort === 'amount-low' ? 'selected' : ''}>Amount: low to high</option></select></div>
    <article class="card"><div class="table-scroll"><table class="data-table"><thead><tr><th>Description</th><th>Type</th><th>Category</th><th>Date</th><th>Amount</th><th>Actions</th></tr></thead><tbody>${rows.length ? rows.map(record => `<tr><td><strong>${escapeHtml(record.description)}</strong>${record.originActivityId ? '<br><span class="muted">Linked savings activity</span>' : record.notes ? `<br><span class="muted">${escapeHtml(record.notes)}</span>` : ''}</td><td><span class="badge">${record.type === 'income' ? `${iconSvg('trending-up', 'inline-icon', 14)} Income` : `${iconSvg('trending-down', 'inline-icon', 14)} Expense`}</span></td><td>${escapeHtml(record.category)}</td><td>${displayDate(record.date)}</td><td class="amount ${record.type}">${record.type === 'income' ? '+' : '−'}${money(record.amount)}</td><td><div class="actions-cell">${record.originActivityId ? '' : `<button class="icon-action" type="button" title="Edit" aria-label="Edit transaction" data-action="edit-transaction" data-id="${escapeHtml(record.id)}">${iconSvg('pencil', '', 16)}</button>`}<button class="icon-action" type="button" title="Delete" aria-label="Delete transaction" data-action="delete-transaction" data-id="${escapeHtml(record.id)}">${iconSvg('trash-2', '', 16)}</button></div></td></tr>`).join('') : `<tr><td colspan="6">${emptyState(iconSvg('arrow-left-right', 'empty-icon'), 'No matching transactions', 'Change the filters or add a new transaction.', addButton('Add transaction', 'transaction'))}</td></tr>`}</tbody></table></div></article>`;
}

function budgetSpend(budget) {
  return budgetActual(state.data.transactions, budget);
}

function renderBudgets() {
  const current = monthKey();
  const month = document.querySelector('#budget-month')?.value || current;
  const budgets = state.data.budgets.filter(row => row.month === month).sort((a, b) => (a.category || '').localeCompare(b.category || ''));
  const totalBudget = plannedBudgetTotal(budgets);
  const totalSpent = totalOf(state.data.transactions, row => row.type === 'expense' && row.date?.slice(0, 7) === month);
  const monthLabel = new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric' }).format(new Date(`${month}-01T12:00:00`));
  app.innerHTML = `${pageHeading('PLAN AHEAD', 'Budgets', 'Plan for school, home, and changing income with categories that fit your life.', `<button class="button" type="button" data-action="budget-template" aria-label="Build from a guide" title="Build from a guide">${iconSvg('sparkles', 'button-icon', 18)}<span class="button-label">Build from a guide</span></button>${addButton('Create budget', 'budget', 'wallet')}`)}
    <div class="filter-bar"><label class="form-field" style="display:flex;align-items:center;gap:8px"><span class="muted">Budget month</span><input class="field-control" id="budget-month" type="month" value="${escapeHtml(month)}"></label></div>
    <div class="budget-summary"><article class="card"><small>Planned budget</small><strong>${money(totalBudget)}</strong></article><article class="card"><small>Actual expenses</small><strong>${money(totalSpent)}</strong></article><article class="card"><small>Remaining</small><strong>${money(totalBudget - totalSpent)}</strong></article></div>
    <div class="section-row"><h2>${escapeHtml(monthLabel)} budgets</h2><span class="muted" style="font-size:9px">${budgets.length} budget${budgets.length === 1 ? '' : 's'}</span></div>
    ${budgets.length ? `<div style="display:grid;gap:10px">${budgets.map(budget => {
      const spent = budgetSpend(budget); const percent = budget.amount ? Math.round(spent / budget.amount * 100) : 0; const remaining = budget.amount - spent;
      const alertThreshold = Number(state.data.budgetAlertThreshold) || 80;
      const status = percent >= 100 ? 'over' : percent >= alertThreshold ? 'warn' : '';
      return `<article class="card budget-card"><div class="budget-top"><div><strong>${escapeHtml(budget.category || 'Overall monthly budget')}</strong><small>${escapeHtml(monthLabel)}${percent >= alertThreshold ? ` · ${percent >= 100 ? 'Budget exceeded' : `${alertThreshold}% budget alert`}` : ''}</small></div><div class="budget-numbers"><strong>${money(spent)} / ${money(budget.amount)}</strong><br>${percent}% used</div></div><div class="budget-meter"><span class="${status}" style="width:${Math.min(100, percent)}%"></span></div><div class="budget-bottom"><span>${money(remaining)} ${remaining < 0 ? 'over budget' : 'remaining'}</span><span class="actions-cell"><button class="icon-action" type="button" title="Edit" aria-label="Edit budget" data-action="edit-budget" data-id="${escapeHtml(budget.id)}">${iconSvg('pencil', '', 16)}</button><button class="icon-action" type="button" title="Delete" aria-label="Delete budget" data-action="delete-budget" data-id="${escapeHtml(budget.id)}">${iconSvg('trash-2', '', 16)}</button></span></div></article>`;
    }).join('')}</div>` : `<article class="card" style="margin-top:13px">${emptyState(iconSvg('wallet', 'empty-icon'), 'No budget for this month', 'Create an overall or category budget to compare your plan against real expenses.')}</article>`}`;
}

function goalCurrent(goalId) {
  return savingsBalance(goalId, state.data.savingsActivities);
}

function renderSavings() {
  const goals = [...state.data.savingsGoals].sort((a, b) => a.createdAt - b.createdAt);
  const activities = [...state.data.savingsActivities].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt).slice(0, 10);
  app.innerHTML = `${pageHeading('BUILD A BUFFER', 'Savings goals', 'Track deposits and withdrawals separately from income and expenses.', addButton('New savings goal', 'goal'))}
    ${goals.length ? `<div class="savings-grid">${goals.map(goal => {
      const current = goalCurrent(goal.id); const target = Number(goal.targetAmount); const percent = target ? Math.min(100, Math.round(current / target * 100)) : 0;
      return `<article class="card goal-card"><div class="goal-header"><div class="goal-name"><div class="goal-icon">${iconSvg('piggy-bank', '', 20)}</div><div><h3>${escapeHtml(goal.name)}</h3><small>${goal.completed ? 'Completed' : goal.targetDate ? `Target ${displayDate(goal.targetDate)}` : 'No target date'}</small></div></div><button class="icon-action" type="button" aria-label="Edit goal" title="Edit goal" data-action="edit-goal" data-id="${escapeHtml(goal.id)}">${iconSvg('pencil', '', 16)}</button></div><div class="goal-amount">${money(current)} <span>of ${money(target)}</span></div><div class="goal-progress"><span style="width:${percent}%"></span></div><div class="goal-footer"><span>${percent}% saved</span><span>${money(Math.max(0, target - current))} to go</span></div><div class="goal-actions"><button class="button small primary" type="button" data-action="add-activity" data-id="${escapeHtml(goal.id)}" data-kind="deposit">${iconSvg('plus', 'button-icon', 16)} Deposit</button><button class="button small" type="button" data-action="add-activity" data-id="${escapeHtml(goal.id)}" data-kind="withdrawal">${iconSvg('minus', 'button-icon', 16)} Withdraw</button><button class="button small" type="button" data-action="goal-history" data-id="${escapeHtml(goal.id)}">${iconSvg('calendar-days', 'button-icon', 16)} History</button><button class="button small" type="button" data-action="toggle-goal" data-id="${escapeHtml(goal.id)}">${goal.completed ? 'Reopen' : 'Complete'}</button><button class="button small danger" type="button" data-action="delete-goal" data-id="${escapeHtml(goal.id)}" aria-label="Delete goal">${iconSvg('trash-2', '', 16)}</button></div></article>`;
    }).join('')}</div>` : `<article class="card">${emptyState(iconSvg('piggy-bank', 'empty-icon'), 'Give your savings a destination', 'Create a goal and record deposits or withdrawals as they happen.', addButton('Create savings goal', 'goal', 'piggy-bank'))}</article>`}
    <div class="section-row"><h2>Recent savings activity</h2><span class="muted" style="font-size:9px">${activities.length} recent record${activities.length === 1 ? '' : 's'}</span></div>
    ${activities.length ? `<article class="card"><div class="table-scroll"><table class="data-table"><thead><tr><th>Goal</th><th>Activity</th><th>Date</th><th>Amount</th><th></th></tr></thead><tbody>${activities.map(activity => { const goal = goals.find(item => item.id === activity.goalId) || state.data.savingsGoals.find(item => item.id === activity.goalId); return `<tr><td>${escapeHtml(goal?.name || 'Deleted goal')}</td><td>${activity.type === 'deposit' ? 'Deposit' : 'Withdrawal'}${activity.note ? `<br><span class="muted">${escapeHtml(activity.note)}</span>` : ''}</td><td>${displayDate(activity.date)}</td><td class="amount ${activity.type === 'deposit' ? 'income' : ''}">${activity.type === 'deposit' ? '+' : '−'}${money(activity.amount)}</td><td><button class="icon-action" type="button" title="Delete activity" aria-label="Delete savings activity" data-action="delete-activity" data-id="${escapeHtml(activity.id)}">${iconSvg('trash-2', '', 16)}</button></td></tr>`; }).join('')}</tbody></table></div></article>` : ''}`;
}

function reportRange() {
  const now = new Date();
  const start = state.report.start || document.querySelector('#report-start')?.value || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const end = localDate(now);
  state.report = { start, end };
  return { start, end };
}

function filteredTransactions(start, end) {
  return state.data.transactions.filter(row => row.date >= start && row.date <= end);
}

function renderReports() {
  const { start, end } = reportRange();
  const records = filteredTransactions(start, end);
  const { income, expenses } = summarizeTransactions(records, start, end);
  const spendByCategory = records.filter(row => row.type === 'expense').reduce((map, row) => map.set(row.category, (map.get(row.category) || 0) + Number(row.amount)), new Map());
  const incomeByCategory = records.filter(row => row.type === 'income').reduce((map, row) => map.set(row.category, (map.get(row.category) || 0) + Number(row.amount)), new Map());
  const monthly = new Map();
  records.forEach(row => {
    const key = row.date.slice(0, 7);
    if (!monthly.has(key)) monthly.set(key, { income: 0, expense: 0 });
    monthly.get(key)[row.type] += Number(row.amount);
  });
  const monthLabels = [...monthly.keys()].sort();
  const monthNames = monthLabels.map(key => new Intl.DateTimeFormat('en-PH', { month: 'short' }).format(new Date(`${key}-01T12:00:00`)));
  const periodName = start === end ? displayDate(start) : `${displayDate(start)} – ${displayDate(end)}`;
  const activityHTML = (title, map) => `<div class="chart-title"><div><h3>${title}</h3><p>For selected dates</p></div></div><div class="category-list">${[...map.entries()].sort((a, b) => b[1] - a[1]).map(([category, value], index) => `<div class="category-line"><div class="category-name"><span class="category-dot" style="background:${chartColors[index % chartColors.length]}"></span>${escapeHtml(category)}</div><div class="category-total">${money(value)}</div><div class="progress-track"><div class="progress-fill" style="width:${Math.max(3, value / Math.max(...map.values(), 1) * 100)}%;background:${chartColors[index % chartColors.length]}"></div></div></div>`).join('') || `<p class="muted" style="font-size:10px">No records in this period.</p>`}</div>`;
  const budgets = state.data.budgets.filter(budget => budget.month >= start.slice(0, 7) && budget.month <= end.slice(0, 7));
  const budgetReport = budgets.map(budget => `<div class="category-line"><div class="category-name">${escapeHtml(budget.category || 'Overall monthly')}</div><div class="category-total">${money(budgetSpend(budget))} / ${money(budget.amount)}</div><div class="progress-track"><div class="progress-fill" style="width:${Math.min(100, budget.amount ? budgetSpend(budget) / budget.amount * 100 : 0)}%"></div></div></div>`).join('');
  app.innerHTML = `${pageHeading('KNOW YOUR NUMBERS', 'Reports', 'Accurate summaries from your local transaction history.', `<button class="button" type="button" data-action="export-csv" aria-label="Export CSV" title="Export CSV">${iconSvg('download', 'button-icon', 18)}<span class="button-label">Export CSV</span></button>`)}
    <div class="filter-bar report-controls"><button class="button small" type="button" data-action="report-period" data-period="day">Today</button><button class="button small" type="button" data-action="report-period" data-period="week">This week</button><button class="button small" type="button" data-action="report-period" data-period="month">This month</button><button class="button small" type="button" data-action="report-period" data-period="year">This year</button><span class="muted" style="font-size:9px">From</span><input class="field-control" id="report-start" type="date" max="${localDate()}" value="${escapeHtml(start)}" aria-label="Report start date"><span class="muted" style="font-size:9px">Through ${escapeHtml(displayDate(end))}</span><span class="muted" style="font-size:9px">${escapeHtml(periodName)}</span></div>
    <div class="report-metrics"><div class="report-metric"><small>Total income</small><strong>${money(income)}</strong></div><div class="report-metric"><small>Total expenses</small><strong>${money(expenses)}</strong></div><div class="report-metric"><small>Net cash flow</small><strong>${money(income - expenses)}</strong></div></div>
    <div class="report-grid"><article class="card report-card wide"><div class="chart-title"><div><h3>Monthly financial trend</h3><p>Actual income and expenses · ${escapeHtml(periodName)}</p></div><div class="legend"><span><i></i>Income</span><span><i class="legend-expense"></i>Expenses</span></div></div>${chartCanvas('report-trend', 'Monthly income and expense trend')}</article><article class="card report-card"><div class="chart-title"><div><h3>Income vs expenses</h3><p>Selected date range</p></div></div>${chartCanvas('report-comparison', 'Income compared with expenses')}</article><article class="card report-card"><div class="chart-title"><div><h3>Expense breakdown</h3><p>By category</p></div></div>${chartCanvas('report-doughnut', 'Expense breakdown by category')}</article><article class="card report-card">${activityHTML('Expense categories', spendByCategory)}</article><article class="card report-card">${activityHTML('Income categories', incomeByCategory)}</article><article class="card report-card wide"><div class="chart-title"><div><h3>Budget performance</h3><p>Actual expense totals against configured budgets</p></div></div>${budgetReport ? `<div class="category-list">${budgetReport}</div>` : `<p class="muted" style="font-size:10px">No budgets set for this period.</p>`}</article><article class="card report-card wide"><div class="chart-title"><div><h3>Savings progress</h3><p>Current goal balances</p></div></div>${state.data.savingsGoals.length ? chartCanvas('report-savings', 'Savings goal progress compared with targets') : `<p class="muted" style="font-size:10px">Create a savings goal to see progress here.</p>`}</article></div>`;
  drawBarChart(document.querySelector('#report-comparison'), [income], [expenses], ['Selected range']);
  drawTrendChart(document.querySelector('#report-trend'), monthLabels.map(key => monthly.get(key).income), monthLabels.map(key => monthly.get(key).expense), monthNames);
  drawDoughnut(document.querySelector('#report-doughnut'), [...spendByCategory.entries()]);
  drawBarChart(document.querySelector('#report-savings'), state.data.savingsGoals.map(goal => goalCurrent(goal.id)), state.data.savingsGoals.map(goal => Number(goal.targetAmount)), state.data.savingsGoals.map(goal => goal.name));
}

function drawTrendChart(canvas, income, expenses, labels) {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect(); const ratio = window.devicePixelRatio || 1;
  const width = Math.max(240, rect.width); const height = Math.max(140, rect.height);
  canvas.width = width * ratio; canvas.height = height * ratio;
  const ctx = canvas.getContext('2d'); ctx.scale(ratio, ratio);
  const styles = getComputedStyle(document.documentElement); const muted = styles.getPropertyValue('--muted').trim(); const grid = styles.getPropertyValue('--line').trim();
  const max = Math.max(1, ...income, ...expenses) * 1.15; const left = 32; const right = 10; const top = 12; const bottom = 25; const plotHeight = height - top - bottom; const plotWidth = width - left - right;
  ctx.clearRect(0, 0, width, height); ctx.font = '9px Inter, sans-serif'; ctx.fillStyle = muted; ctx.strokeStyle = grid;
  for (let index = 0; index < 4; index += 1) { const y = top + plotHeight * index / 3; ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(width - right, y); ctx.stroke(); }
  const x = index => left + plotWidth * (labels.length < 2 ? .5 : index / (labels.length - 1));
  const drawLine = (values, color) => {
    ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 2;
    values.forEach((value, index) => { const y = top + plotHeight - value / max * plotHeight; if (index === 0) ctx.moveTo(x(index), y); else ctx.lineTo(x(index), y); });
    ctx.stroke(); values.forEach((value, index) => { ctx.beginPath(); ctx.fillStyle = color; ctx.arc(x(index), top + plotHeight - value / max * plotHeight, 3, 0, Math.PI * 2); ctx.fill(); });
  };
  if (labels.length) { drawLine(income, '#7657d8'); drawLine(expenses, '#e399b8'); }
  ctx.textAlign = 'center'; ctx.fillStyle = muted;
  labels.forEach((label, index) => ctx.fillText(String(label).slice(0, 8), x(index), height - 7));
}

function drawBarChart(canvas, primary, secondary, labels) {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(240, rect.width); const height = Math.max(140, rect.height);
  canvas.width = width * ratio; canvas.height = height * ratio;
  const ctx = canvas.getContext('2d'); ctx.scale(ratio, ratio);
  const styles = getComputedStyle(document.documentElement); const muted = styles.getPropertyValue('--muted').trim(); const grid = styles.getPropertyValue('--line').trim();
  const max = Math.max(1, ...primary, ...secondary) * 1.15; const left = 32; const right = 8; const top = 10; const bottom = 25; const plotHeight = height - top - bottom; const plotWidth = width - left - right;
  ctx.clearRect(0, 0, width, height); ctx.font = '9px Inter, sans-serif'; ctx.fillStyle = muted; ctx.strokeStyle = grid; ctx.lineWidth = 1;
  for (let index = 0; index < 4; index += 1) { const y = top + plotHeight * index / 3; ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(width - right, y); ctx.stroke(); }
  const slot = plotWidth / Math.max(1, labels.length); const barWidth = Math.min(22, slot * .28);
  labels.forEach((label, index) => {
    const center = left + slot * (index + .5); const aHeight = (primary[index] || 0) / max * plotHeight; const bHeight = (secondary[index] || 0) / max * plotHeight;
    ctx.fillStyle = '#7657d8'; ctx.beginPath(); ctx.roundRect(center - barWidth - 2, top + plotHeight - aHeight, barWidth, aHeight, 3); ctx.fill();
    ctx.fillStyle = '#d9cff6'; ctx.beginPath(); ctx.roundRect(center + 2, top + plotHeight - bHeight, barWidth, bHeight, 3); ctx.fill();
    ctx.textAlign = 'center'; ctx.fillStyle = muted; ctx.fillText(String(label).slice(0, 8), center, height - 7);
  });
}

function drawDoughnut(canvas, values) {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect(); const ratio = window.devicePixelRatio || 1;
  const width = Math.max(240, rect.width); const height = Math.max(140, rect.height);
  canvas.width = width * ratio; canvas.height = height * ratio;
  const ctx = canvas.getContext('2d'); ctx.scale(ratio, ratio); ctx.clearRect(0, 0, width, height);
  if (!values.length) { ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--muted'); ctx.font = '11px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('No expense data', width / 2, height / 2); return; }
  const total = values.reduce((sum, [, value]) => sum + value, 0); const radius = Math.min(height * .4, width * .25); const centerX = width * .34; const centerY = height / 2; let angle = -Math.PI / 2;
  values.forEach(([, value], index) => { const next = angle + value / total * Math.PI * 2; ctx.beginPath(); ctx.arc(centerX, centerY, radius, angle, next); ctx.arc(centerX, centerY, radius * .58, next, angle, true); ctx.closePath(); ctx.fillStyle = chartColors[index % chartColors.length]; ctx.fill(); angle = next; });
  ctx.textAlign = 'left'; ctx.font = '9px Inter, sans-serif';
  values.slice(0, 6).forEach(([name, value], index) => { const y = 20 + index * 19; ctx.fillStyle = chartColors[index % chartColors.length]; ctx.fillRect(width * .62, y - 7, 7, 7); ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--ink'); ctx.fillText(`${String(name).slice(0, 15)} ${Math.round(value / total * 100)}%`, width * .62 + 12, y); });
}

function renderSettings() {
  const expenseCategories = state.data.categories.filter(item => item.kind === 'expense').sort((a, b) => a.name.localeCompare(b.name));
  const incomeCategories = state.data.categories.filter(item => item.kind === 'income').sort((a, b) => a.name.localeCompare(b.name));
  const categoryGroup = (title, items) => `<div class="category-group"><h3>${title}</h3><div class="category-chips">${items.map(item => `<span class="category-chip">${escapeHtml(item.name)}${item.custom ? `<button type="button" aria-label="Delete ${escapeHtml(item.name)} category" title="Delete category" data-action="delete-category" data-id="${escapeHtml(item.id)}">${iconSvg('x', '', 14)}</button>` : ''}</span>`).join('')}</div></div>`;
  const alertThreshold = Number(state.data.budgetAlertThreshold) || 80;
  const weekStartsOn = Number(state.data.weekStartsOn ?? 1);
  const alertOptions = [50, 60, 70, 80, 90].map(value => `<option value="${value}" ${value === alertThreshold ? 'selected' : ''}>${value}% used</option>`).join('');
  const weekOptions = [{ value: 1, label: 'Monday' }, { value: 0, label: 'Sunday' }].map(option => `<option value="${option.value}" ${option.value === weekStartsOn ? 'selected' : ''}>${option.label}</option>`).join('');
  app.innerHTML = `${pageHeading(`YOUR DEVICE · VERSION ${APP_VERSION}`, 'Settings & data', 'Manage local preferences, categories, and app installation.', '')}
    <div class="settings-grid"><article class="card settings-section"><h2>Preferences</h2><p>Set the app’s appearance and budgeting defaults for this device.</p><div class="setting-row"><div><strong>Dark theme</strong><small>Use a darker interface in low light.</small></div><label class="switch"><input id="theme-setting" type="checkbox" ${document.documentElement.dataset.theme === 'dark' ? 'checked' : ''} aria-label="Enable dark theme"><span></span></label></div><div class="setting-row"><div><strong>Link savings movements to transactions</strong><small>Deposits become expenses and withdrawals become income. Off by default.</small></div><label class="switch"><input id="savings-link-setting" type="checkbox" ${state.data.savingsLinked ? 'checked' : ''} aria-label="Link savings activities to transactions"><span></span></label></div><div class="setting-row"><div><strong>Budget warning</strong><small>Warn when spending reaches this share of a budget.</small></div><select id="budget-alert-threshold" class="field-control preference-select" aria-label="Budget warning threshold">${alertOptions}</select></div><div class="setting-row"><div><strong>Week starts on</strong><small>Used by the weekly report preset.</small></div><select id="week-start" class="field-control preference-select" aria-label="First day of week">${weekOptions}</select></div><div class="setting-row"><div><strong>Currency</strong><small>Philippine Peso · PHP · en-PH</small></div><span class="badge">₱ PHP</span></div><div class="setting-row"><div><strong>Install PesoWise</strong><small>Add the app to this device’s home screen.</small></div><button type="button" class="button small primary" data-action="install-app">${iconSvg('download', 'button-icon', 16)} Install</button></div></article>
    <article class="card settings-section" style="grid-column:1/-1"><h2>Transaction categories</h2><p>Manage categories used for new records. Categories with existing transactions cannot be removed.</p><div class="category-manage">${categoryGroup('Expense', expenseCategories)}${categoryGroup('Income', incomeCategories)}<div><button class="button small" type="button" data-action="add-category">${iconSvg('plus', 'button-icon', 16)} Add category</button></div></div></article>
    <article class="card settings-section" style="grid-column:1/-1"><h2>Privacy & storage</h2><p>Financial records and recent recovery snapshots are saved automatically in this browser’s IndexedDB. They are separate from cached app files, so clearing only the cache does not delete your records. To erase them, clear PesoWise site data or app storage in your browser or device settings. Nothing is uploaded.</p><p style="margin-bottom:0">PesoWise has no account or analytics. A local PIN would not encrypt the underlying database, so PIN protection is not enabled.</p></article></div>`;
}

async function render() {
  state.page = location.hash.slice(1).split('?')[0] || 'dashboard';
  if (!['dashboard', 'transactions', 'budgets', 'savings', 'reports', 'settings'].includes(state.page)) state.page = 'dashboard';
  document.querySelectorAll('[data-page]').forEach(link => {
    const active = link.dataset.page === state.page;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  await loadData();
  const renderers = { dashboard: renderDashboard, transactions: renderTransactions, budgets: renderBudgets, savings: renderSavings, reports: renderReports, settings: renderSettings };
  const renderPage = renderers[state.page];
  const shouldTransition = state.renderedPage !== null && state.renderedPage !== state.page;
  if (shouldTransition && document.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    try {
      document.startViewTransition(renderPage);
    } catch {
      renderPage();
      app.classList.remove('page-enter');
      void app.offsetWidth;
      app.classList.add('page-enter');
    }
  } else {
    renderPage();
    if (shouldTransition) {
      app.classList.remove('page-enter');
      void app.offsetWidth;
      app.classList.add('page-enter');
    }
  }
  state.renderedPage = state.page;
}

function openDialog(title, subtitle, content, wide = false) {
  dialogRoot.innerHTML = `<div class="dialog-backdrop" data-action="backdrop-close"><section class="dialog ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><header class="dialog-head"><div><h2 id="dialog-title">${title}</h2><p>${subtitle}</p></div><button class="dialog-close" type="button" aria-label="Close dialog" data-action="close-dialog">${iconSvg('x', '', 18)}</button></header><div class="dialog-body">${content}</div></section></div>`;
  dialogRoot.querySelector('input,select,textarea,button')?.focus();
}

function closeDialog() {
  dialogRoot.innerHTML = '';
}

function field(label, name, value, options = {}) {
  const { type = 'text', required = false, full = false, placeholder = '', min = '', step = '', help = '' } = options;
  return `<div class="form-field ${full ? 'full' : ''}"><label for="field-${name}">${label}${required ? ' *' : ''}</label><input id="field-${name}" name="${name}" type="${type}" value="${escapeHtml(value)}" ${required ? 'required' : ''} ${min ? `min="${min}"` : ''} ${step ? `step="${step}"` : ''} ${placeholder ? `placeholder="${escapeHtml(placeholder)}"` : ''}>${help ? `<small class="form-help">${help}</small>` : ''}</div>`;
}

function transactionForm(record = null, type = 'expense') {
  const chosenType = record?.type || type;
  const categories = state.data.categories.filter(item => item.kind === chosenType).sort((a, b) => a.name.localeCompare(b.name));
  const categorySelect = `<div class="form-field"><label for="field-category">Category *</label><select id="field-category" name="category" required>${categories.map(category => `<option value="${escapeHtml(category.name)}" ${category.name === (record?.category || (chosenType === 'income' ? 'Salary' : 'Food')) ? 'selected' : ''}>${escapeHtml(category.name)}</option>`).join('')}</select></div>`;
  openDialog(record ? 'Edit transaction' : 'New transaction', 'Record income or an expense.', `<form data-form="transaction" data-id="${escapeHtml(record?.id || '')}"><div class="form-grid"><div class="form-field"><label for="field-type">Type *</label><select id="field-type" name="type" required><option value="expense" ${chosenType === 'expense' ? 'selected' : ''}>Expense</option><option value="income" ${chosenType === 'income' ? 'selected' : ''}>Income</option></select></div>${categorySelect}${field('Description', 'description', record?.description || '', { required: true, full: true, placeholder: 'What was this for?' })}${field('Amount (PHP)', 'amount', record?.amount ?? '', { type: 'number', required: true, min: '0.01', step: '0.01' })}${field('Date', 'date', record?.date || localDate(), { type: 'date', required: true })}<div class="form-field full"><label for="field-notes">Notes <span class="muted">(optional)</span></label><textarea id="field-notes" name="notes" maxlength="500" placeholder="Add a note">${escapeHtml(record?.notes || '')}</textarea></div></div><div class="form-error" data-error></div><div class="dialog-actions"><button class="button" type="button" data-action="close-dialog">Cancel</button><button class="button primary" type="submit">${record ? 'Save changes' : 'Save transaction'}</button></div></form>`);
}

function budgetForm(record = null) {
  const categoryOptionsMarkup = state.data.categories.filter(item => item.kind === 'expense').sort((a, b) => a.name.localeCompare(b.name)).map(item => `<option value="${escapeHtml(item.name)}" ${record?.category === item.name ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('');
  openDialog(record ? 'Edit budget' : 'Create budget', 'Budgets are compared with actual expense transactions.', `<form data-form="budget" data-id="${escapeHtml(record?.id || '')}"><div class="form-grid"><div class="form-field"><label for="field-month">Month *</label><input id="field-month" name="month" type="month" value="${escapeHtml(record?.month || monthKey())}" required></div><div class="form-field"><label for="field-category">Category</label><select id="field-category" name="category"><option value="">Overall monthly budget</option>${categoryOptionsMarkup}</select></div>${field('Budget amount (PHP)', 'amount', record?.amount ?? '', { type: 'number', required: true, min: '0.01', step: '0.01', full: true })}</div><div class="form-error" data-error></div><div class="dialog-actions"><button class="button" type="button" data-action="close-dialog">Cancel</button><button class="button primary" type="submit">${record ? 'Save budget' : 'Create budget'}</button></div></form>`);
}

function templateCategoryFields(profile, month) {
  const template = budgetTemplates[profile] || budgetTemplates.student;
  const alreadyBudgeted = new Set(state.data.budgets.filter(item => item.month === month).map(item => item.category || ''));
  const categories = template.categories.filter(category => !alreadyBudgeted.has(category));
  if (!categories.length) return '<p class="muted" style="font-size:10px">Every category in this guide already has a budget for that month.</p>';
  return categories.map((category, index) => `<div class="form-field"><label for="template-budget-${index}">${escapeHtml(category)}</label><div class="template-amount"><span>₱</span><input id="template-budget-${index}" name="amount__${escapeHtml(category)}" type="number" min="0.01" step="0.01" placeholder="Leave blank to skip" inputmode="decimal"></div></div>`).join('');
}

function budgetTemplateForm(month = monthKey(), profile = 'student') {
  const template = budgetTemplates[profile];
  openDialog('Build a monthly budget', template.description, `<form data-form="budget-template"><div class="form-grid"><div class="form-field"><label for="budget-template-profile">Budget guide</label><select id="budget-template-profile" name="profile">${Object.entries(budgetTemplates).map(([key, item]) => `<option value="${key}" ${key === profile ? 'selected' : ''}>${escapeHtml(item.label)}</option>`).join('')}</select></div><div class="form-field"><label for="budget-template-month">Month</label><input id="budget-template-month" name="month" type="month" value="${escapeHtml(month)}" required></div></div><p class="template-note">Choose only the categories you need. Enter your own monthly limits; blank fields are skipped.</p><div id="budget-template-fields" class="template-budget-grid">${templateCategoryFields(profile, month)}</div><div class="form-error" data-error></div><div class="dialog-actions"><button class="button" type="button" data-action="close-dialog">Cancel</button><button class="button primary" type="submit">Save selected budgets</button></div></form>`, true);
}

async function saveBudgetTemplate(form) {
  const values = formValues(form); const template = budgetTemplates[values.profile]; const month = values.month; const error = form.querySelector('[data-error]');
  if (!template || !/^\d{4}-\d{2}$/.test(month)) { error.textContent = 'Choose a valid guide and month.'; return; }
  const entries = [];
  for (const category of template.categories) {
    const raw = values[`amount__${category}`];
    if (!raw) continue;
    const amount = validAmount(raw);
    if (!amount) { error.textContent = `Enter a positive amount with up to two decimals for ${category}.`; return; }
    if (Number(raw) !== amount) { error.textContent = `Use no more than two decimal places for ${category}.`; return; }
    if (state.data.budgets.some(item => item.month === month && item.category === category)) { error.textContent = `${category} already has a budget for this month. Refresh the guide and try again.`; return; }
    entries.push({ id: id(), month, category, amount, createdAt: Date.now(), updatedAt: Date.now() });
  }
  if (!entries.length) { error.textContent = 'Enter an amount for at least one category.'; return; }
  for (const entry of entries) await putRecord('budgets', entry);
  closeDialog(); toast(`${entries.length} ${entries.length === 1 ? 'budget' : 'budgets'} added.`); await render();
}

function goalForm(record = null) {
  openDialog(record ? 'Edit savings goal' : 'New savings goal', 'Savings activities stay separate from your income and expenses.', `<form data-form="goal" data-id="${escapeHtml(record?.id || '')}"><div class="form-grid">${field('Goal name', 'name', record?.name || '', { required: true, full: true, placeholder: 'e.g. Emergency fund' })}${field('Target amount (PHP)', 'targetAmount', record?.targetAmount ?? '', { type: 'number', required: true, min: '0.01', step: '0.01' })}${field('Target date', 'targetDate', record?.targetDate || '', { type: 'date' })}</div><div class="form-error" data-error></div><div class="dialog-actions"><button class="button" type="button" data-action="close-dialog">Cancel</button><button class="button primary" type="submit">${record ? 'Save goal' : 'Create goal'}</button></div></form>`);
}

function activityForm(goalId, type) {
  const goal = state.data.savingsGoals.find(item => item.id === goalId);
  const current = goalCurrent(goalId);
  openDialog(type === 'deposit' ? 'Add savings deposit' : 'Record withdrawal', escapeHtml(goal?.name || 'Savings goal'), `<form data-form="activity" data-goal-id="${escapeHtml(goalId)}" data-type="${type}"><div class="form-grid">${field('Amount (PHP)', 'amount', '', { type: 'number', required: true, min: '0.01', step: '0.01', full: true })}${field('Date', 'date', localDate(), { type: 'date', required: true })}<div class="form-field full"><label for="field-note">Note <span class="muted">(optional)</span></label><input id="field-note" name="note" maxlength="200" placeholder="Add a note"></div></div><small class="form-help">Current balance: ${money(current)}${state.data.savingsLinked ? ' · This movement will also create a transaction.' : ''}</small><div class="form-error" data-error></div><div class="dialog-actions"><button class="button" type="button" data-action="close-dialog">Cancel</button><button class="button primary" type="submit">Record ${type}</button></div></form>`);
}

function savingsQuickAction() {
  if (!state.data.savingsGoals.length) { goalForm(); return; }
  if (state.data.savingsGoals.length === 1) { activityForm(state.data.savingsGoals[0].id, 'deposit'); return; }
  const options = state.data.savingsGoals.map(goal => `<option value="${escapeHtml(goal.id)}">${escapeHtml(goal.name)}</option>`).join('');
  openDialog('Add savings', 'Choose the goal for this deposit.', `<form data-form="quick-saving"><div class="form-field"><label for="field-goalId">Savings goal</label><select id="field-goalId" name="goalId">${options}</select></div><div class="dialog-actions"><button class="button" type="button" data-action="close-dialog">Cancel</button><button class="button primary" type="submit">Continue</button></div></form>`);
}

function categoryForm() {
  openDialog('Add category', 'Create a custom transaction category.', `<form data-form="category"><div class="form-grid"><div class="form-field"><label for="field-kind">Type *</label><select id="field-kind" name="kind"><option value="expense">Expense</option><option value="income">Income</option></select></div>${field('Category name', 'name', '', { required: true, placeholder: 'e.g. Pet care' })}</div><div class="form-error" data-error></div><div class="dialog-actions"><button class="button" type="button" data-action="close-dialog">Cancel</button><button class="button primary" type="submit">Add category</button></div></form>`);
}

function showTransaction(record) {
  openDialog(escapeHtml(record.description), `${record.type === 'income' ? 'Income' : 'Expense'} · ${displayDate(record.date)}`, `<div class="form-grid"><div class="form-field"><label>Amount</label><strong class="amount ${record.type}" style="text-align:left;font-size:19px">${record.type === 'income' ? '+' : '−'}${money(record.amount)}</strong></div><div class="form-field"><label>Category</label><strong>${escapeHtml(record.category)}</strong></div><div class="form-field full"><label>Notes</label><span>${escapeHtml(record.notes || (record.originActivityId ? 'Linked savings activity' : 'No notes'))}</span></div><div class="form-field"><label>Created</label><span>${displayDate(localDate(new Date(record.createdAt)))}</span></div><div class="form-field"><label>Last updated</label><span>${displayDate(localDate(new Date(record.updatedAt)))}</span></div></div><div class="dialog-actions"><button class="button danger" type="button" data-action="delete-transaction" data-id="${escapeHtml(record.id)}">Delete</button>${record.originActivityId ? '' : `<button class="button" type="button" data-action="edit-transaction" data-id="${escapeHtml(record.id)}">Edit</button>`}<button class="button primary" type="button" data-action="close-dialog">Done</button></div>`);
}

function showGoalHistory(goalId) {
  const goal = state.data.savingsGoals.find(item => item.id === goalId);
  const rows = state.data.savingsActivities.filter(item => item.goalId === goalId).sort((a, b) => b.date.localeCompare(a.date));
  openDialog(`${escapeHtml(goal?.name || 'Savings goal')} history`, `${rows.length} savings activities · Current balance ${money(goalCurrent(goalId))}`, rows.length ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>Type</th><th>Date</th><th>Note</th><th>Amount</th></tr></thead><tbody>${rows.map(row => `<tr><td>${row.type === 'deposit' ? 'Deposit' : 'Withdrawal'}</td><td>${displayDate(row.date)}</td><td>${escapeHtml(row.note || '—')}</td><td class="amount ${row.type === 'deposit' ? 'income' : ''}">${row.type === 'deposit' ? '+' : '−'}${money(row.amount)}</td></tr>`).join('')}</tbody></table></div><div class="dialog-actions"><button class="button primary" type="button" data-action="close-dialog">Done</button></div>` : `${emptyState(iconSvg('calendar-days', 'empty-icon'), 'No activity yet', 'Record a deposit or withdrawal to build the history.')}` , true);
}

function showInstallHelp() {
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const instructions = standalone
    ? 'PesoWise is already running as an installed app on this device.'
    : ios
      ? 'Open this page in Safari, tap the Share button, then choose “Add to Home Screen”. The app and its saved data stay on this device.'
      : 'Open this page in Chrome, then use the browser menu and choose “Install app” or “Add to Home screen”. The app and its saved data stay on this device.';
  openDialog('Install PesoWise', ios ? 'For iPhone and iPad' : 'For Android and supported browsers', `<p style="margin:0;color:var(--muted);font-size:11px;line-height:1.6">${escapeHtml(instructions)}</p><div class="dialog-actions"><button class="button primary" type="button" data-action="close-dialog">Got it</button></div>`);
}

function formValues(form) {
  return Object.fromEntries(new FormData(form).entries());
}

async function saveTransaction(form) {
  const values = formValues(form); const amount = validAmount(values.amount); const error = form.querySelector('[data-error]');
  if (!amount) { error.textContent = 'Enter an amount greater than zero with no more than two decimal places.'; return; }
  if (!values.description.trim() || !values.date || new Date(`${values.date}T00:00:00`).toString() === 'Invalid Date') { error.textContent = 'Add a description and a valid date.'; return; }
  if (Number(values.amount) !== amount) { error.textContent = 'Use no more than two decimal places.'; return; }
  const old = form.dataset.id ? await getById('transactions', form.dataset.id) : null;
  const now = Date.now();
  await putRecord('transactions', { id: old?.id || id(), description: values.description.trim(), amount, category: values.category, type: values.type, date: values.date, notes: values.notes.trim(), createdAt: old?.createdAt || now, updatedAt: now, month: values.date.slice(0, 7), originActivityId: old?.originActivityId || null });
  closeDialog(); toast(old ? 'Transaction updated.' : 'Transaction saved.'); await render();
}

async function saveBudget(form) {
  const values = formValues(form); const amount = validAmount(values.amount); const error = form.querySelector('[data-error]');
  if (!amount || Number(values.amount) !== amount) { error.textContent = 'Enter a positive amount with no more than two decimal places.'; return; }
  if (!/^\d{4}-\d{2}$/.test(values.month)) { error.textContent = 'Choose a valid budget month.'; return; }
  const duplicate = state.data.budgets.find(item => item.month === values.month && (item.category || '') === values.category && item.id !== form.dataset.id);
  if (duplicate) { error.textContent = 'A budget already exists for this month and category. Edit that budget instead.'; return; }
  const old = form.dataset.id ? await getById('budgets', form.dataset.id) : null; const now = Date.now();
  await putRecord('budgets', { id: old?.id || id(), month: values.month, category: values.category, amount, createdAt: old?.createdAt || now, updatedAt: now });
  closeDialog(); toast(old ? 'Budget updated.' : 'Budget created.'); await render();
}

async function saveGoal(form) {
  const values = formValues(form); const amount = validAmount(values.targetAmount); const error = form.querySelector('[data-error]');
  if (!values.name.trim()) { error.textContent = 'Enter a name for this goal.'; return; }
  if (!amount || Number(values.targetAmount) !== amount) { error.textContent = 'Enter a positive target with no more than two decimal places.'; return; }
  const old = form.dataset.id ? await getById('savingsGoals', form.dataset.id) : null; const now = Date.now();
  await putRecord('savingsGoals', { id: old?.id || id(), name: values.name.trim(), targetAmount: amount, targetDate: values.targetDate, completed: old?.completed || false, createdAt: old?.createdAt || now, updatedAt: now });
  closeDialog(); toast(old ? 'Savings goal updated.' : 'Savings goal created.'); await render();
}

async function saveActivity(form) {
  const values = formValues(form); const amount = validAmount(values.amount); const error = form.querySelector('[data-error]'); const goalId = form.dataset.goalId; const type = form.dataset.type;
  if (!amount || Number(values.amount) !== amount) { error.textContent = 'Enter a positive amount with no more than two decimal places.'; return; }
  if (type === 'withdrawal' && amount > goalCurrent(goalId)) { error.textContent = 'A withdrawal cannot be greater than the current goal balance.'; return; }
  const goal = state.data.savingsGoals.find(item => item.id === goalId); if (!goal) { error.textContent = 'This goal no longer exists.'; return; }
  const activityId = id(); const now = Date.now(); let linkedTransactionId = null;
  if (state.data.savingsLinked) {
    linkedTransactionId = id();
    const transactionType = type === 'deposit' ? 'expense' : 'income';
    const category = transactionType === 'expense' ? (state.data.categories.find(item => item.kind === 'expense')?.name || expenseDefaults.at(-1)) : (state.data.categories.find(item => item.kind === 'income')?.name || incomeDefaults.at(-1));
    await putRecord('transactions', { id: linkedTransactionId, description: `${type === 'deposit' ? 'Savings deposit' : 'Savings withdrawal'}: ${goal.name}`, amount, category, type: transactionType, date: values.date, notes: values.note.trim(), createdAt: now, updatedAt: now, month: values.date.slice(0, 7), originActivityId: activityId });
  }
  await putRecord('savingsActivities', { id: activityId, goalId, type, amount, date: values.date, note: values.note.trim(), createdAt: now, linkedTransactionId });
  closeDialog(); toast(`${type === 'deposit' ? 'Deposit' : 'Withdrawal'} recorded.`); await render();
}

async function saveCategory(form) {
  const values = formValues(form); const name = values.name.trim(); const error = form.querySelector('[data-error]');
  if (!name || name.length > 32) { error.textContent = 'Enter a category name from 1 to 32 characters.'; return; }
  if (state.data.categories.some(item => item.kind === values.kind && item.name.toLowerCase() === name.toLowerCase())) { error.textContent = 'That category already exists.'; return; }
  await putRecord('categories', { id: id(), name, kind: values.kind, custom: true });
  closeDialog(); toast('Category added.'); await render();
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(url);
}

async function exportCsv() {
  const rows = [['Date', 'Type', 'Description', 'Category', 'Amount', 'Notes'], ...state.data.transactions.slice().sort((a, b) => a.date.localeCompare(b.date)).map(row => [row.date, row.type, row.description, row.category, Number(row.amount).toFixed(2), row.notes || ''])];
  const csv = `\uFEFF${rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n')}`;
  downloadFile(`pesowise-transactions-${localDate()}.csv`, csv, 'text/csv;charset=utf-8'); toast('CSV export downloaded.');
}

async function removeTransaction(transactionId) {
  if (!window.confirm('Delete this transaction? This cannot be undone.')) return;
  const transaction = await getById('transactions', transactionId);
  await deleteRecord('transactions', transactionId);
  closeDialog(); toast('Transaction deleted.');
  if (transaction?.originActivityId) {
    const activity = await getById('savingsActivities', transaction.originActivityId);
    if (activity) { activity.linkedTransactionId = null; await putRecord('savingsActivities', activity); }
  }
  await render();
}

async function removeBudget(budgetId) {
  if (!window.confirm('Delete this budget?')) return;
  await deleteRecord('budgets', budgetId); toast('Budget deleted.'); await render();
}

async function removeGoal(goalId) {
  const linkedActivities = state.data.savingsActivities.filter(item => item.goalId === goalId);
  if (!window.confirm(`Delete this savings goal and its ${linkedActivities.length} activities? Linked transactions, if any, will remain.`)) return;
  await deleteRecord('savingsGoals', goalId);
  for (const activity of linkedActivities) await deleteRecord('savingsActivities', activity.id);
  toast('Savings goal deleted.'); await render();
}

async function toggleGoal(goalId) {
  const goal = await getById('savingsGoals', goalId);
  if (!goal) return;
  goal.completed = !goal.completed;
  goal.updatedAt = Date.now();
  await putRecord('savingsGoals', goal);
  toast(goal.completed ? 'Savings goal marked complete.' : 'Savings goal reopened.');
  await render();
}

async function removeActivity(activityId) {
  if (!window.confirm('Delete this savings activity?')) return;
  const activity = await getById('savingsActivities', activityId);
  if (activity?.linkedTransactionId) await deleteRecord('transactions', activity.linkedTransactionId);
  await deleteRecord('savingsActivities', activityId); toast('Savings activity deleted.'); await render();
}

async function removeCategory(categoryId) {
  const category = state.data.categories.find(item => item.id === categoryId);
  if (!category) return;
  const inTransactions = state.data.transactions.some(row => row.category === category.name);
  const inBudgets = state.data.budgets.some(row => row.category === category.name);
  if (inTransactions || inBudgets) { toast('This category is used by existing records and cannot be removed.', 'error'); return; }
  if (!window.confirm(`Delete the ${category.name} category?`)) return;
  await deleteRecord('categories', categoryId); toast('Category deleted.'); await render();
}

document.addEventListener('click', async event => {
  const pageLink = event.target.closest('[data-page]');
  if (pageLink) { event.preventDefault(); location.hash = pageLink.dataset.page; await render(); return; }
  const button = event.target.closest('[data-action]'); if (!button) return;
  const action = button.dataset.action; const recordId = button.dataset.id;
  try {
    if (action === 'close-dialog' || (action === 'backdrop-close' && event.target === button)) closeDialog();
    else if (action === 'fab') {
      if (state.page === 'budgets') budgetForm();
      else if (state.page === 'savings') goalForm();
      else openDialog('Add', 'What would you like to record?', `<div class="add-choice">${addButton('Add expense', 'transaction-expense', 'trending-down')}${addButton('Add income', 'transaction-income', 'trending-up')}</div>`);
    }
    else if (action === 'add-transaction') transactionForm();
    else if (action === 'add-transaction-income') transactionForm(null, 'income');
    else if (action === 'add-transaction-expense') transactionForm(null, 'expense');
    else if (action === 'add-budget') budgetForm();
    else if (action === 'budget-template') budgetTemplateForm(document.querySelector('#budget-month')?.value || monthKey());
    else if (action === 'add-goal') goalForm();
    else if (action === 'add-savings') savingsQuickAction();
    else if (action === 'add-activity') activityForm(recordId, button.dataset.kind);
    else if (action === 'edit-transaction') { const row = await getById('transactions', recordId); if (row) transactionForm(row); }
    else if (action === 'view-transaction') { const row = await getById('transactions', recordId); if (row) showTransaction(row); }
    else if (action === 'delete-transaction') await removeTransaction(recordId);
    else if (action === 'edit-budget') { const row = await getById('budgets', recordId); if (row) budgetForm(row); }
    else if (action === 'delete-budget') await removeBudget(recordId);
    else if (action === 'edit-goal') { const row = await getById('savingsGoals', recordId); if (row) goalForm(row); }
    else if (action === 'delete-goal') await removeGoal(recordId);
    else if (action === 'toggle-goal') await toggleGoal(recordId);
    else if (action === 'delete-activity') await removeActivity(recordId);
    else if (action === 'goal-history') showGoalHistory(recordId);
    else if (action === 'add-category') categoryForm();
    else if (action === 'delete-category') await removeCategory(recordId);
    else if (action === 'export-csv') await exportCsv();
    else if (action === 'install-app' && state.installPrompt) { await state.installPrompt.prompt(); state.installPrompt = null; await render(); }
    else if (action === 'install-app') showInstallHelp();
    else if (action === 'apply-update') state.serviceWorkerRegistration?.waiting?.postMessage('SKIP_WAITING');
    else if (action === 'report-period') {
      const now = new Date(); let start; let end = localDate(now);
      if (button.dataset.period === 'day') start = end;
      else if (button.dataset.period === 'week') start = localDate(weekStartDate(now, state.data.weekStartsOn));
      else if (button.dataset.period === 'year') start = `${now.getFullYear()}-01-01`;
      else start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      state.report = { start, end }; renderReports();
    }
  } catch (error) { toast(error.message || 'Something went wrong.', 'error'); }
});

document.addEventListener('submit', async event => {
  const form = event.target.closest('[data-form]'); if (!form) return;
  event.preventDefault();
  try {
    if (form.dataset.form === 'transaction') await saveTransaction(form);
    else if (form.dataset.form === 'budget') await saveBudget(form);
    else if (form.dataset.form === 'budget-template') await saveBudgetTemplate(form);
    else if (form.dataset.form === 'goal') await saveGoal(form);
    else if (form.dataset.form === 'activity') await saveActivity(form);
    else if (form.dataset.form === 'category') await saveCategory(form);
    else if (form.dataset.form === 'quick-saving') { const goalId = formValues(form).goalId; closeDialog(); activityForm(goalId, 'deposit'); }
  } catch (error) { form.querySelector('[data-error]').textContent = error.message || 'Unable to save this record.'; }
});

document.addEventListener('change', async event => {
  if (event.target.matches('#budget-template-profile, #budget-template-month')) {
    const form = event.target.closest('form');
    const profile = form.querySelector('#budget-template-profile').value;
    const month = form.querySelector('#budget-template-month').value;
    form.closest('.dialog').querySelector('.dialog-head p').textContent = budgetTemplates[profile].description;
    form.querySelector('#budget-template-fields').innerHTML = templateCategoryFields(profile, month);
    form.querySelector('[data-error]').textContent = '';
  } else if (event.target.id === 'field-type') {
    const form = event.target.closest('form'); const categoryField = form?.querySelector('#field-category');
    const type = event.target.value; const categories = state.data.categories.filter(item => item.kind === type).sort((a, b) => a.name.localeCompare(b.name));
    if (categoryField) categoryField.innerHTML = categories.map(item => `<option value="${escapeHtml(item.name)}">${escapeHtml(item.name)}</option>`).join('');
  } else if (event.target.id === 'theme-setting') {
    applyTheme(event.target.checked ? 'dark' : 'light');
  } else if (event.target.id === 'savings-link-setting') {
    await setSetting('savingsLinked', event.target.checked); state.data.savingsLinked = event.target.checked; toast('Savings transaction linking updated.');
  } else if (event.target.id === 'budget-alert-threshold') {
    const value = Number(event.target.value);
    await setSetting('budgetAlertThreshold', value); state.data.budgetAlertThreshold = value; toast(`Budget warning set to ${value}%.`);
  } else if (event.target.id === 'week-start') {
    const value = Number(event.target.value);
    await setSetting('weekStartsOn', value); state.data.weekStartsOn = value; toast(`Week now starts on ${value === 1 ? 'Monday' : 'Sunday'}.`);
  } else if (event.target.matches('#budget-month')) {
    await render();
  } else if (event.target.matches('#report-start')) {
    state.report = { start: event.target.value, end: localDate() }; renderReports();
  } else if (event.target.matches('#transaction-type, #transaction-category, #transaction-from, #transaction-sort')) {
    if (event.target.id === 'transaction-type') document.querySelector('#transaction-category').value = 'all';
    renderTransactions();
  }
});

document.addEventListener('input', event => {
  if (event.target.id === 'transaction-search') {
    const position = event.target.selectionStart; renderTransactions();
    const replacement = document.querySelector('#transaction-search'); replacement?.focus(); replacement?.setSelectionRange(position, position);
  }
});

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('pesowise-theme', theme);
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = theme === 'dark' ? '#191523' : '#7355d9';
  if (state.page === 'dashboard' || state.page === 'reports') {
    if (state.page === 'dashboard') drawBarChart(document.querySelector('#dashboard-bars'), [currentStats().monthIncome], [currentStats().monthExpenses], ['This month']);
    else renderReports();
  }
}

window.addEventListener('hashchange', () => render().catch(error => toast(error.message, 'error')));
window.addEventListener('resize', () => {
  if (state.page === 'dashboard') { const stats = currentStats(); drawBarChart(document.querySelector('#dashboard-bars'), [stats.monthIncome], [stats.monthExpenses], ['This month']); }
  if (state.page === 'reports') renderReports();
});
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  state.installPrompt = event;
  render().catch(error => toast(error.message, 'error'));
});
window.addEventListener('appinstalled', () => { state.installPrompt = null; toast('PesoWise installed.'); if (state.page === 'settings') renderSettings(); });

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  try {
    const registration = await navigator.serviceWorker.register('./sw.js');
    state.serviceWorkerRegistration = registration;
    const showUpdate = () => {
      const notice = document.createElement('div'); notice.className = 'toast'; notice.innerHTML = 'A PesoWise update is ready. <button class="text-link" type="button" data-action="apply-update">Refresh</button>'; toastRegion.append(notice);
    };
    if (registration.waiting) showUpdate();
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdate();
      });
    });
    navigator.serviceWorker.addEventListener('controllerchange', () => location.reload());
  } catch (error) { console.warn('Offline support could not be registered.', error); }
}

async function start() {
  try {
    const savedTheme = localStorage.getItem('pesowise-theme');
    if (savedTheme === 'dark' || savedTheme === 'light') applyTheme(savedTheme);
    await initializeDatabase();
    await render();
    await registerServiceWorker();
  } catch (error) {
    app.innerHTML = `<article class="card">${emptyState(iconSvg('circle-alert', 'empty-icon'), 'PesoWise could not start', escapeHtml(error.message || 'Local storage is unavailable.'))}</article>`;
  }
}

start();