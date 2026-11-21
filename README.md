# FOTO-POTO

A photo-sharing community app. This repository is independent from GameFit.

## Included in this first version

- Email sign-up and sign-in
- Shared photo feed
- Image upload (JPG, PNG, WEBP, max 5 MB)
- Captions and topic tags
- Likes and comments
- Newest / popular sorting
- Server-side Gemini image moderation before upload
- Supabase Row Level Security policies

No events, Pixel Battle, or GameFit features are included.

## 1. Create a Supabase project

The repository is the website code; Supabase provides accounts, database, and image storage. Create a project in your Supabase dashboard. In Project Settings / API, copy the Project URL and the publishable key.

Open the Supabase SQL Editor and run the complete file `supabase/schema.sql`.

## 2. Configure the website

In `app.js`, replace:
- `YOUR_SUPABASE_PROJECT_URL`
- `YOUR_SUPABASE_PUBLISHABLE_KEY`

Use the publishable key only. Never put a secret/service-role key or Gemini API key in browser code.

## 3. Configure Gemini moderation

Create a Gemini API key in Google AI Studio. Deploy the Edge Function from this repository using the Supabase CLI:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy moderate-image
supabase secrets set GEMINI_API_KEY=YOUR_GEMINI_API_KEY
```

The Gemini key must be a server-side secret. The moderation function fails closed: if Gemini is unavailable or returns an invalid result, the photo is not published.

The classifier is intentionally narrow: it blocks pornography and clearly explicit sexual content. It must not block ordinary photos because of a person's sexual orientation, gender identity, or who appears with them. Automated moderation can make mistakes, so review and reporting tools should be added before opening the site to a large public audience.

## 4. Deploy the website

This is a static site and can be deployed with Cloudflare Pages:
- Connect this GitHub repository.
- Framework preset: None.
- Build command: leave empty.
- Build output directory: `/` (repository root).

After deployment, add the live domain to Supabase Auth's allowed redirect URLs.

## Important

The code is committed to GitHub, but the public site is not deployed by this repository commit alone. Supabase project credentials and the Gemini secret must be configured before sign-in, shared posts, uploads, and moderation work.
