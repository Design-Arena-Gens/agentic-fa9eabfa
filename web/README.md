## Inbox Agent

Inbox Agent is a Next.js + Tailwind app that watches your Gmail inbox, drafts AI-powered replies, and automatically sends responses to straightforward emails.

### Features

- Polls your Gmail inbox every minute and surfaces the newest conversations.
- Generates polished reply drafts with OpenAI and explains when a review is needed.
- One-click auto-reply for simple messages; skips those that need human approval.
- Manual drafting workflow with live editing and send controls.
- Deployable on Vercel with serverless API routes.

### Prerequisites

1. **Google Cloud project** with the Gmail API enabled.
2. **OAuth 2.0 credentials** (web app) capturing the redirect URI you will use in prod.
3. A **refresh token** for the Gmail account you want the agent to manage. Obtain this via the OAuth consent screen and `offline` access.
4. An **OpenAI API key** with access to `gpt-4o-mini` (or adjust the model in `src/lib/openai.ts`).

Populate the variables in `.env.local` using `.env.example` as a template:

```bash
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=https://your-app.vercel.app/api/auth/callback/google
GOOGLE_REFRESH_TOKEN=refresh-token-generated-for-your-account
GOOGLE_SENDER_EMAIL=you@example.com
OPENAI_API_KEY=sk-...
```

> ⚠️ The refresh token must belong to the same Google account as `GOOGLE_SENDER_EMAIL`. The OAuth client must include the Gmail scopes used in `src/lib/gmail.ts`.

### Local Development

```bash
npm install
npm run dev
```

Visit `http://localhost:3000` to use the agent. The top bar exposes manual refresh and auto-reply controls.

### Building & Testing

```bash
npm run lint
npm run build
```

Both commands should succeed before deployment. Linting validates TypeScript types and catches missing environment variables at runtime only when API routes execute.

### Deployment

Deploy straight to Vercel once environment variables are configured in your project settings:

```bash
vercel deploy --prod --yes --token $VERCEL_TOKEN --name agentic-fa9eabfa
```

After the CLI reports success, wait a few seconds and verify the deployment:

```bash
curl https://agentic-fa9eabfa.vercel.app
```

### Customisation

- Adjust polling cadence or auto-reply heuristics inside `src/app/page.tsx`.
- Extend AI prompts in `src/lib/openai.ts`.
- Modify Gmail handling (labels, filters, sending logic) in `src/lib/gmail.ts`.

### Security Notes

- Store secrets only in Vercel environment variables or a secure secret manager.
- Consider enabling the Gmail Push API or Pub/Sub for real-time updates instead of polling when moving beyond hobby usage.
