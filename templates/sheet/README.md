# Tracker Sheet setup

The job-search agent keeps its tracker in a Google Sheet you own. A small Apps Script bound to that Sheet exposes it over HTTPS, so the engine never needs Google OAuth credentials on your machine. Setup takes about five minutes.

1. Create a blank Google Sheet at https://sheets.new and name it something like "Job Search Tracker". You do not need to add tabs or headers; the script creates them in step 8.
2. Make sure you are signed in with the Google account that should own the tracker.
3. In that Sheet, open Extensions > Apps Script. Delete whatever is in `Code.gs`, paste the contents of [`templates/apps-script/Code.gs`](../apps-script/Code.gs), and save (Cmd/Ctrl+S).
4. Generate a secret: any long random string of 24+ characters works. On a Mac or Linux terminal: `openssl rand -hex 24`.
5. In the Apps Script editor open Project Settings (gear icon) > Script properties > Add script property. Property: `JOBSEARCH_SECRET`. Value: the secret from step 4. Save.
6. Deploy > New deployment. Type: Web app. Execute as: Me. Who has access: Anyone. Click Deploy and authorize the script when prompted (it only has access to this one spreadsheet because of `@OnlyCurrentDoc`).
7. Copy the Web app URL. It looks like `https://script.google.com/macros/s/.../exec`.
8. Run `jobsearch sheet setup` and paste the `/exec` URL and the secret when asked. The command stores both in `~/.job-search/secrets.json` (mode 600), calls the script's `setup` action to create the `Jobs` and `Skipped` tabs with the right headers, and pings it.
9. Optional browser check: open `<exec URL>?action=ping&secret=<your secret>`. You should see `{"ok":true,...}` with both tabs listed.
10. Every time you edit `Code.gs` later, publish a new version (Deploy > Manage deployments > pencil icon > Version: New version > Deploy). The `/exec` URL keeps serving the old code until you do.

Keep the secret private. Anyone who has both the URL and the secret can read and write the tracker.
