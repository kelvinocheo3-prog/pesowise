# PesoWise

PesoWise is a static, offline-first personal finance tracker. It has no account, backend, analytics, CDN dependencies, or remote financial data transfer. Transaction, budget, savings, category, and preference records are stored in IndexedDB on the current browser profile.

## Run locally

Serve the project over HTTP; service workers and installation do not work from a `file://` URL.

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000`. The app shell is cached on its first successful load. Financial records remain in IndexedDB and are never placed in Cache Storage.

Run the finance arithmetic tests with:

```sh
node --test tests/finance.test.js
```

## Deploy to GitHub Pages

1. Push the project files to a GitHub repository.
2. In the repository, open **Settings → Pages**.
3. Choose **Deploy from a branch**, select the branch and `/ (root)`, then save.
4. Open the published HTTPS URL once while online. The service worker can then serve the application shell offline.

The app is static and needs no build step. Keep `manifest.json`, `sw.js`, `offline.html`, `icon.svg`, `apple-touch-icon.png`, `icons/`, `assets/fonts/`, `css/`, and `js/` at the paths used by `index.html`. The bundled Inter font is licensed under the SIL Open Font License; no font is fetched from a CDN. GitHub Pages serves HTTPS, which is required for service workers outside localhost.

On Android, open the published HTTPS URL in Chrome and use **Install app** when prompted, or choose **Install app / Add to Home screen** from the browser menu. On iPhone or iPad, open the URL in Safari, tap **Share**, then **Add to Home Screen**. iOS does not emit the Android-style install prompt, so PesoWise includes these instructions in **Settings & data**.

## Data and automatic protection

- Financial changes are saved to IndexedDB automatically. PesoWise also keeps up to seven recent, private recovery snapshots in a separate IndexedDB store; there are no manual backup or restore controls in the app.
- Automatic snapshots are stored only in this browser profile and are not uploaded. Clearing browser site data removes both financial records and snapshots, so this is not protection against device loss or browser-data clearing.
- CSV export remains available from Reports and contains transactions only.
- The optional savings-link setting creates income/expense transactions for new savings deposits/withdrawals. It is off by default. Turning it off does not remove previously linked transactions.
- A local PIN is not provided. A PIN would not encrypt IndexedDB and would not protect data from someone with access to the browser profile.

## Compatibility notes

Use a current browser with IndexedDB, ES modules, Canvas, and service-worker support. The manifest includes Android-sized PNG icons and the page includes an Apple touch icon. No records are preloaded: the dashboard starts empty until transactions are added.