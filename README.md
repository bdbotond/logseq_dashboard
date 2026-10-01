# Logseq Project Task Flow & Mindmap Plugin

Logseq plugin for managing project task outlines, automated timestamped audit logs per project, live summary table, and mindmap visualization.

## Features

- **Master Tasks Page**: Creates a central workspace (`Projects & Tasks`) with project splits, active milestones, and embedded live dashboard.
- **Multi-Project Linking**: Annotates tasks with your existing project pages (`[[Project A]]`, `[[Project B]]`).
- **Automated Project Logs**: Every project page receives an automated `## Project Log` section recording when tasks are added and when they are completed (`TODO` -> `DONE`) with timestamps.
- **Quick Task Capture**: Modal dialog (`Mod+Shift+T` or toolbar button) to pick project, input task description, set native status (`TODO`, `DOING`, `NOW`, `LATER`, `WAITING`), and pick scheduled dates.
- **Vertical Stacked Dashboard**:
  - Top: Live summary table with status badges, scheduled dates, created and completed timestamps, search and status filters, and jump-to-block actions.
  - Middle: Live visual mindmap partitioned by `Project -> Active Tasks vs Completed & Past`.
  - Bottom: Interactive Gantt Chart with curved dependency arrows, topological sorting, and overdue/late tracking.
- **Bi-Directional Task Dependencies**:
  - Link prerequisite tasks (`Depends On`) and retroactive/past dependencies (`Blocks / Predecessor For`).
  - Interactive `🔗` badge to open the Live Dependency Editor from Summary Table, Gantt Chart, or macro blocks.
- **Journals Calendar Plugin Integration**:
  - Automatically mirrors scheduled and due tasks to their respective Daily Journal pages under `### 📅 Scheduled Tasks` and `### ⏳ Due Today (Deadlines)` as live interactive embeds (`{{embed ((task-uuid))}}`).
  - Dates with tasks are highlighted in the **Journals Calendar** plugin, allowing date-based navigation and direct task completion from the daily journal.
- **Interactive Mindmap Mode**: Fullscreen/modal interactive SVG view with zoom, pan, and collapsible tree nodes.
- **Live Sync & Reload**: Auto-refreshes when tasks change in Logseq outline (`DB.onChanged`), plus manual Refresh and Sync buttons.

## Companion Plugin: Journals Calendar (Required / Recommended)

This package integrates directly with the **Journals Calendar** plugin (`xyhp915/logseq-journals-calendar`):

1. **How it works**:
   - Any task with a `Scheduled` date is embedded into that date's Daily Journal page under `### 📅 Scheduled Tasks`.
   - Any task with a `Deadline` date is embedded into that date's Daily Journal page under `### ⏳ Due Today (Deadlines)`.
   - Changes, status toggles, and notes on embedded tasks stay synchronized with the master task block.
   - The **Journals Calendar** plugin automatically detects these journal pages and highlights the dates on the calendar.
   - Clicking a date in the calendar opens the corresponding Daily Journal page showing all tasks for that day.

2. **Installation via Marketplace**:
   - In Logseq, go to `...` menu > `Plugins` > `Marketplace`.
   - Search for **Journals Calendar** (by `xyhp915`) and click **Install**.

3. **Commands**:
   - Slash Command: `/Sync Tasks to Journals`
   - Command Palette: `Project Flow: Sync All Tasks to Daily Journals (Calendar)`
   - Command Palette: `Project Flow: Open Today's Journal (Journals Calendar)`
   - Dashboard buttons: **Sync Journals** and **Journals Calendar** buttons in the toolbar and macro header.

## Installation in Logseq

1. Open **Logseq**.
2. Go to **Settings** (`...` menu in top right > `Settings`).
3. Under **Advanced**, enable **Developer mode**.
4. Open **Plugins** (`...` menu > `Plugins`) and switch to the **Installed** tab.
5. Click **Load unpacked plugin** and select `./log_seq_plug_in`.

## Usage & Commands

### 1. Initialize Master Tasks Page
- Command Palette (`Ctrl+K` or `Cmd+K`): Type `Project Flow: Initialize Master Projects & Tasks Page`.
- Creates `[[Projects & Tasks]]` with project sections and the live dashboard renderer.

### 2. Quick Task Capture
- Shortcut: `Ctrl+Shift+T` (or `Cmd+Shift+T`).
- Toolbar: Click the `+` button in the top toolbar.
- Select your existing project (or enter a new project name), type task title, status, and scheduled date.
- Automatically inserts task into outline and appends to the project's `## Project Log`.

### 3. Automatic Status Logging
- Check off any task block (marking it `DONE`) directly in Logseq.
- The background task watcher updates the block's `completed-at` property and logs a completion entry with timestamp into that project's `## Project Log`.

### 4. Live Dashboard & Mindmap
- **In-Page Macro**: Type `/Project Dashboard` in any block to insert `{{renderer :project-dashboard}}`.
- Shows the Summary Table on top and the Project Mindmap directly beneath it.
- Click **Refresh** to reload tasks, or **Interactive Mindmap** for full pan/zoom.

## Development

```bash
# Typecheck
npm run typecheck

# Production build
npm run build
```
# logseq_dashboard
