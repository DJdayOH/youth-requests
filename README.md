# On Repeat

A mobile-friendly song request and voting page, hosted as static files on GitHub Pages. Requests and song searches use the existing Google Apps Script endpoint in `app.js`.

## Editing styles

Requires Node.js and npm:

```sh
npm ci
npm run build
```

After editing `src/styles.css` or `app.js`, run `npm run build`. The build compiles CSS and updates content-based version tags for CSS and JavaScript in `index.html`, preventing reuse of older cached assets. Include the generated `style.css` and updated `index.html` when committing changes. GitHub Pages can continue publishing directly from this directory; no deployment workflow change is required. Tailwind and daisyUI are build dependencies only; the browser loads the compiled local stylesheet and `app.js`.

Preview locally with `python3 -m http.server 8000` and open http://localhost:8000.

## Backend behavior

The Apps Script POST endpoint uses `no-cors`, so the browser cannot inspect its response or confirm acceptance. The interface reports requests as sent; refreshing the voting list checks whether they have appeared. Vote totals are not exposed by the current endpoint, so the interface does not display totals.
