# Flashmind

Offline-first flashcard app with image/audio attachments, auto-save, and a clean editing experience. Data is stored locally on your machine — no accounts, no cloud.

## Tech Stack

- **Framework:** React 19, TypeScript
- **Build:** Vite 8, TypeScript 6
- **Styling:** Tailwind CSS 4
- **Animation:** Framer Motion
- **Icons:** Lucide React
- **Persistence:** Browser File System Access API (`flashmind.json`)

## Setup

```bash
npm install
npm run dev
```

Open the URL printed by Vite (default `http://localhost:5173`). On first launch you'll be prompted to select a folder — this is where your `flashmind.json` data file will be stored.

## Build

```bash
npm run build
```

Output goes to `dist/`.

## Usage

- Click **New Flashcard Set** to create a set
- Add cards with terms, definitions, images, and audio recordings
- Auto-save saves your work as you type
- Click **Practice** to quiz yourself

<!-- Add screenshots here -->
