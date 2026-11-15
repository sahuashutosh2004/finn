**To:** assessment@enam.com
**Subject:** IIT Delhi – AI Engineer - 2027

Dear ENAM team,

Please find my submission for the AI Engineer Build Challenge: FINN, a mobile-first app that helps an investor with an 18-stock NSE portfolio see what matters today. The idea is to filter, not aggregate: FINN reads every filing and price move, ranks them with transparent rules, and lets you tap any number to see where it came from.

**What I built**

- **Yahoo + Screener + BSE instead of NSE scraping.** NSE's site blocks bots and changes often. Yahoo gives daily prices. Screener gives the financial tables, the BSE code and transcript links. BSE's announcements API gives the full 30-day filing list. Every refresh cross-checks Yahoo's close against Screener's price and flags gaps over 1%. If BSE fails, the app falls back to Screener's latest filings and says so on screen.
- **Keyword rules for ranking, so it runs free.** Filings are classified into the challenge's categories and tiered Important, Notable, Other or Routine, with a boost when the stock also moved on price or volume. It's instant, costs nothing and can be explained line by line. "Top 3 for today" shows fewer than three rather than pad the list.
- **A cheap model only where reading a PDF needs it, and every quote checked.** Gemini Flash-Lite reads earnings-call transcripts for management guidance and important filings for a one-line "why it matters". Code checks that each quote appears word for word in the PDF and each number appears in the source; anything else is rejected. Promised-vs-delivered verdicts (on track, missed, too early) are computed from Screener's tables, not by the model. Model answers are cached by PDF URL. A full first refresh used about 148k tokens, which is free on the free tier. Without a key, the app works fully and shows the tables-only version.
- **The company page works for any NSE symbol.** 23 companies are prefetched. Any other symbol is fetched live from Screener and BSE with the same parsers and cached for a day. Prices and tables appear first and the AI sections stream in after.
- **Small touches:**
  - Tap any number for its receipt: source, table and row or PDF, raw value and fetch time.
  - Swipe to mark filings done or pin them, with "All caught up".
  - A brief title that follows the time of day.
  - An en-IN read-aloud of the Top 3.

**What I left out**

- Real phone push notifications. Alerts are in-app only.
- Reading results numbers straight from the results PDF. Results come from Screener's tables, which can lag a filing by a day.

**What I'd do next**

- Parse the results PDF directly and reconcile it with Screener, so a new quarter shows the moment it's filed.
- Web push notifications for the Important tier, using the same thresholds as the Alerts screen.
- Track each guidance item across several calls, so the track record covers more than the latest transcript.
- Intraday prices during market hours.

**Live:** https://finn-two-ashen.vercel.app
**GitHub:** https://github.com/sahuashutosh2004/finn
**Build History:** https://github.com/sahuashutosh2004/finn/blob/main/docs/build-history/cursor-chat.md

Thank you for your time.

Regards,
Ashutosh Sahu
IIT Delhi
