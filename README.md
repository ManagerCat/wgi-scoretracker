# WGI Scoretracker

> Centralized scoring aggregation, analytics, and historical tracking across competitive winter percussion circuits.

[![Live Demo](https://img.shields.io/badge/Live_Site-bluetapio.ca-blue?style=flat-square)](https://bluetapio.ca)

---

## Overview

Winter percussion is a highly decentralized activity, with numerous independent regional circuits and national organizations operating their own distinct scoring systems and schedules. Because data is scattered across legacy websites and disparate formats, comparing competitive trajectories across regions and circuits is notoriously difficult.

**WGI Scoretracker** aggregates, processes, and normalizes scoring data from multiple circuits into a centralized platform, providing performers, educators, and fans with accessible scoring trends, recaps, and head-to-head comparisons.

---

## Architecture & Monorepo Structure

This project is organized as a monorepo structured into three modular services:

* **`packages/backend`**: Automated web scrapers and ETL data processing pipelines that ingest, parse, and normalize score sheets from disparate circuit databases.
* **`packages/api`**: REST/JSON service handling data aggregation, caching layers, and database queries for low-latency client delivery.
* **`packages/website`**: Responsive frontend client built with **Vite** and **React**, featuring dynamic data tables, filtering, and recap visualizations.

---

## Tech Stack

* **Frontend:** React, Vite, TypeScript/Javascript, CSS/Tailwind
* **Backend & API:** Node.js)*, REST API
* **Data & Storage:** Firebase
* **Tooling:** VS Code Task Automation, Monorepo Workspace

---

## How it works

* Scores and recap sheets are ingested via CompetitionSuite's underlying Bridge API, which typically handles dynamic client-side score rendering on local circuit portals.
* Reverse-engineered the undocumented REST endpoints, payload structures, and query parameters via network protocol analysis to automate direct data retrieval.

---

## Getting Started

### Prerequisites
* Node.js (v18+ recommended)
* Package manager: `npm`

### Installation
Clone the repository and install root dependencies:

```bash
git clone [https://github.com/your-username/wgi-scoretracker.git](https://github.com/your-username/wgi-scoretracker.git)
cd wgi-scoretracker
npm install
```
