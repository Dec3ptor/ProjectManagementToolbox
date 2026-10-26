# PM Toolbox

**Projects, time and costs, monthly billing, lab invoices and alerts – in your browser.**

PM Toolbox is a small web app for a project manager who looks after monitoring projects.
It runs entirely in the browser and is hosted on GitHub Pages: nothing is sent anywhere, everything you
import and decide is kept in the browser's own storage (IndexedDB), and a backup is one click away.

It replaces the Project Health Tracker and monitoring spreadsheets with one place that answers:
*what needs doing, what's coming up, how are my projects going, and what have I done this month?*

## What it does

- **Import** your exports as they are. Drop in the **Effort Report** (the raw Oracle export, or the whole
  Project Health Tracker workbook that contains it), the **Power BI export** (budget, revenue, cost, margin,
  WIP and AR per project) and the **monitoring spreadsheet** (schedule grid, lab invoice tracker, tracker
  lists and client details). Each sheet is recognised by its headings, whatever the workbook or sheet is
  called. Re-import a fresh Effort Report any time: transactions are matched by number, invoicing statuses
  update, nothing is duplicated.
- **Projects** – every project the exports mention, with a health badge (on track / watch / at risk / over
  budget) from the Power BI money and thresholds you set. Tick *mine* for the ones you manage; those are
  billed and watched. Each project has an Overview (budget, spent, margin, WIP, AR, hours, a cost-vs-billable
  chart by month), Transactions, People, Tasks, Billing history, Lab invoices and editable Details.
- **Transactions** – the Effort Report line by line: date, person, task, type, hours, cost, bill amount,
  invoicing status and comment. Filter by person, task, invoiced / unbilled, billable / non-billable, or
  search the comments. **Turn billability on or off** with a switch on each line (or select many and mark
  them at once). The export's own view (its *Effort Logic*) is the starting point; your choices are
  remembered by transaction number across imports, and the ones that differ from the export are listed
  as the changes to make in the finance system (copy the list with one click). The workbook's
  *Billability Overrides* sheet is taken on too.
- **People & time** – who has put hours into your projects (billable and non-billable, cost, bill amount,
  unbilled) for this month, last month, the last three months or all time, and the same per project.
- **Monthly billing** – at the start of each month, every project of yours with what there is to bill
  (this month's lines plus anything older still unbilled; fixed-fee projects show the month's work and
  are invoiced by % complete) and a four-step checklist: time reviewed → non-billables marked → sent
  for invoicing → invoiced. Each step is dated when you tick it, the invoice amount and number are kept,
  and the month exports to Excel. Earlier months stay as a record of what you did.
- **Lab invoices** – the Lab Invoice → AP tracker: log an invoice when it arrives (project, PO, lab, invoice
  number, date, amount), *Send to AP* copies the e-mail to accounts payable and marks it sent, and anything
  received but not sent after 14 days (your setting) is flagged. Missing POs are pointed out.
- **Monitoring calendar** – the schedule grid from the spreadsheet, a row per site and a cell per month with
  the same marks (● ▲ # R …). Click a cell to move it along: to do → results to analyse → done →
  cancelled. Marks are kept per year, and survive re-importing the schedule.
- **Dashboard and alerts** – the month's billing progress, billable work not yet invoiced, lab invoices
  waiting, monitoring rounds due; a *Needs attention* list of everything overdue or coming up (billing past
  its due day, lab invoices to send, projects over budget or with a negative margin, monitoring this month
  and next, annual reports due, your to-dos, a stale Effort Report); and a to-do list of your own. Turn on
  browser notifications in Settings and the pressing alerts pop up once a day while the app is open.
- **Settings & backup** – your name (so your projects are picked out on import), the AP e-mail address,
  the alert thresholds, and a JSON backup you can download and restore on another computer.

## Getting started

1. Open the site, go to **Settings** and type your name as the exports write it (e.g. `Foote, Benjamin`).
2. Go to **Import data** and drop in the Project Health Tracker workbook (or the Effort Report export),
   the Power BI export and the monitoring spreadsheet. Check what was recognised and press **Import**.
3. The Dashboard fills in. Work from *Needs attention*; bill from **Monthly billing**; log lab invoices as
   they arrive; mark monitoring rounds on the calendar as they are done.
4. Each month, export a fresh Effort Report and Power BI file and drop them in again. Your billability
   choices, billing records, lab invoices and calendar marks are all kept.
5. Download a backup from Settings now and then.

## Hosting on GitHub Pages

The site is built and published by GitHub Actions on every push to `main`
(`.github/workflows/deploy.yml`). Once, in the repository's **Settings → Pages**, set *Source* to
**GitHub Actions**. The app is then at `https://<user>.github.io/<repository>/`.

Pull requests and other branches run the tests and a build (`.github/workflows/ci.yml`).

## Development

```
npm install
npm run dev        # http://localhost:5173
npm test           # vitest
npm run build      # typecheck + production build into dist/
```

React 18, TypeScript, Vite, Mantine, Dexie (IndexedDB), ECharts and SheetJS for reading Excel – the same
stack as [EnviroDB](https://github.com/dec3ptor/envirodb), and the same look.

### Where things are

| | |
|---|---|
| `src/importers/analyse.ts` | recognises and reads each kind of sheet |
| `src/importers/apply.ts` | writes an import into the database, matching codes to projects |
| `src/lib/billability.ts` | billable or not, and the sums per person / task / month |
| `src/lib/billing.ts` | the monthly billing cycle |
| `src/lib/alerts.ts` | what needs attention |
| `src/lib/health.ts` | how a project is doing |
| `src/lib/schedule.ts` | the monitoring calendar's cells and marks |
| `src/pages/` | one file per page |
| `tests/` | vitest tests, with workbook fixtures shaped like the real exports |

### Your data

The site reads nothing from this repository: you import your own exports in the browser, and they stay
there. Keep your spreadsheets out of the repository.
