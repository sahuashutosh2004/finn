# Build history

FINN was built in one Cursor agent chat. These files are that chat as markdown: my messages and Cursor's text replies, in order. Tool calls (commands, file edits, browser steps) are left out, and any key or token values are replaced with `[removed]`.

- **[cursor-chat.md](cursor-chat.md): the full build.** From the first app shell through the design rework, real prices, filings and alerts, the company page, the final build, and getting it ready to submit. Partway through, the chat started a background agent with the full conversation so far, and that agent finished the build; the file marks where. It ends with Cursor's reply "FINN is ready to submit except for the push".
- **[cursor-deploy-chat.md](cursor-deploy-chat.md): Cursor's built-in export of the main thread.** The export kept only the opening and the end: the first prompt, an early moment when files were being overwritten by another process while Cursor worked, and my "stop" once the background agent was finishing the build.
