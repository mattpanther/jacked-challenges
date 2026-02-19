# Jacked Challenge Tracker

A personal workout tracking web app built to help log and monitor progress through AthleanX's "Jacked" training challenges.

> **Disclaimer:** This app is a personal tool for tracking your own training. It does not reproduce, distribute, or display any proprietary AthleanX program content. You must own access to the relevant AthleanX programs to use this tracker meaningfully.

---

## Features

- **Challenge Hub** — select which challenge you're currently running
- **Session tracking** — log sets, reps, and weights for each workout
- **Progress history** — view past session data to inform current targets
- **Cloud sync** — sign in with Google to sync your progress across devices via Firebase

## Challenges Supported

- **"10 by" 400** — a high-volume, multi-set challenge
- **Jacked Classic** — a last-man-standing elimination-style challenge

## Tech Stack

| Layer          | Technology                         |
| -------------- | ---------------------------------- |
| Framework      | React 18 + Vite                    |
| Routing        | React Router v7                    |
| Backend / Auth | Firebase (Firestore + Google Auth) |
| Styling        | Vanilla CSS                        |
| Icons          | Lucide React                       |
| Deployment     | GitHub Pages                       |

## Using the App

Visit the deployed GitHub Pages URL — no account or setup required.

- The app signs you in **anonymously** on first visit so you can start tracking right away.
- Optionally, click **Sign in with Google** to persist your data across devices.
- Each user's data is stored privately under their own account — no one else can see it.
- As long as usage stays within the Firestore free tier, there will be no cost to use the app.

## Local Development

### Prerequisites

- Node.js 18+

### Setup

```bash
npm install
npm run dev
```

### Build

```bash
npm run build
```

## Privacy

Progress data is stored per-user in Firebase Firestore. No workout data is shared with or visible to anyone else.
