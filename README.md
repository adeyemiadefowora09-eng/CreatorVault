# CreatorVault 🛡️

**A secure payment and deal-management platform for African creators.**

CreatorVault connects creators and brands through funded deals, AI-powered contract risk analysis (AI Deal Guardian), payment tracking, and dynamic trust scores. It helps creators reduce payment disputes, identify risky agreements, and get paid more securely for their work.

---

## 🏗️ Project Architecture

This project is structured as a monorepo containing three main decoupled services:

*   **`frontend/`** — Next.js 15 App Router (React, Tailwind v4, Zustand). Managed by the Frontend Lead.
*   **`backend/`** — Node.js + Express API (Prisma, PostgreSQL, Payaza Payments). Managed by the Backend Lead.
*   **`ai-engine/`** — Node.js + Express Microservice (OpenAI Contract Analysis, Trust Score Math). Managed by the AI Lead.

*For detailed architectural flow, database schemas, and mathematical scoring rules, please read the official [Implementation Plan](./docs/IMPLEMENTATION_PLAN.md).*

---

## 🚀 Getting Started

To run this project locally, you will need to boot up the three different services. Open three separate terminal windows:

**1. Start the Backend API (Port 5000)**
```bash
cd backend
npm install
npm run db:push
npm run dev
```

**2. Start the AI Engine (Port 5001)**
```bash
cd ai-engine
npm install
npm run dev
```

**3. Start the Frontend App (Port 3000)**
```bash
cd frontend
npm install
npm run dev
```

---

## 👥 Team Members

*   **[Name]** — Frontend Lead
*   **[Name]** — Backend Lead
*   **[Name]** — AI & Architecture Lead (Ade)
*   *(Add team members here)*

## 🏆 Hackathon Links

*   **Live Demo URL:** [Insert Link Here]
*   **Pitch Deck / Video:** [Insert Link Here]
*   **Hackathon Page:** [Insert Link Here]
