# Living Canvas

A full-screen, mobile-friendly particle simulation made with HTML, CSS, and vanilla JavaScript. Fifty colorful circles drift, bounce, gently attract, and occasionally turn. Pause freezes the scene; Reset creates a new arrangement while preserving the paused state.

## Run locally

Open `index.html` directly, or run `python3 -m http.server 8000` from this directory. No dependencies or build step are required.

Uses responsive canvas rendering, iPhone safe-area spacing, touch-friendly controls, and standard browser APIs supported in modern iOS Safari. Animation suspends when the page is hidden.

## Publish on GitHub Pages

In the repository's **Settings → Pages**, select **GitHub Actions** as the build source. Push these files to `main` (or run the Deploy Living Canvas workflow manually). The included workflow publishes the three static site files. All asset paths are relative, supporting the repository's Pages subdirectory.

Deployment is configured but requires pushing the files and enabling Pages in GitHub. No external libraries, fonts, or services are used.
