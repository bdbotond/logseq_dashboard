import { LogseqService } from '../services/logseqService';
import { ProjectTask } from '../types';
import { MindmapViewer } from './mindmap';
import { SummaryTable } from './summaryTable';
import { GanttChart } from './ganttChart';
import { ICONS } from './icons';

const getDocEl = <T extends Element>(id: string): T | null =>
  (window.parent?.document || document).getElementById(id) as T | null;

export class DashboardRenderer {
  private static instance: DashboardRenderer;
  private logseqService = LogseqService.getInstance();
  private container: HTMLElement | null = null;
  private summaryTable: SummaryTable | null = null;
  private mindmapViewer: MindmapViewer | null = null;
  private ganttChart: GanttChart | null = null;
  private tasks: ProjectTask[] = [];
  private activeSlots = new Set<string>();

  private macroSummaryTables = new Map<string, SummaryTable>();
  private macroMindmapViewers = new Map<string, MindmapViewer>();
  private macroGanttCharts = new Map<string, GanttChart>();

  public static getInstance(): DashboardRenderer {
    if (!DashboardRenderer.instance) {
      DashboardRenderer.instance = new DashboardRenderer();
    }
    return DashboardRenderer.instance;
  }

  public recordSlot(slot: string): void {
    this.activeSlots.add(slot);
  }

  public async refreshAllSlots(): Promise<void> {
    this.tasks = await this.logseqService.fetchTasksForDashboard();
    const doc = window.parent?.document || document;

    for (const slot of Array.from(this.activeSlots)) {
      const slotEl = doc.getElementById(slot) || doc.querySelector(`[data-slot-id="${slot}"]`) || doc.querySelector(`[id*="${slot}"]`);
      if (!slotEl) {
        this.activeSlots.delete(slot);
        this.macroMindmapViewers.get(slot)?.destroy();
        this.macroGanttCharts.get(slot)?.destroy();
        this.macroSummaryTables.delete(slot);
        this.macroMindmapViewers.delete(slot);
        this.macroGanttCharts.delete(slot);
        continue;
      }

      const table = this.macroSummaryTables.get(slot);
      const mm = this.macroMindmapViewers.get(slot);
      const gantt = this.macroGanttCharts.get(slot);

      if (table) table.setTasks(this.tasks);
      if (mm) mm.setTasks(this.tasks);
      if (gantt) gantt.setTasks(this.tasks);

      const countEl = (window.parent?.document || document).getElementById(`ptf-macro-count-${slot}`);
      if (countEl) countEl.textContent = `${this.tasks.length} tasks`;

      if (!table && !mm && !gantt) {
        await this.renderMacroSlot(slot);
      }
    }

    if (this.container && this.summaryTable && this.mindmapViewer) {
      this.summaryTable.setTasks(this.tasks);
      this.mindmapViewer.setTasks(this.tasks);
      if (this.ganttChart) {
        this.ganttChart.setTasks(this.tasks);
      }
      const countEl = this.container.querySelector('#ptf-modal-task-count');
      if (countEl) {
        countEl.textContent = `${this.tasks.length} tasks`;
      }
    }
  }

  /**
   * Constrain host Logseq block containers to prevent overflowing on the right
   */
  private constrainHostSlot(slot: string): void {
    const doc = window.parent?.document || document;
    const slotEl =
      doc.getElementById(slot) ||
      (doc.querySelector(`[data-slot-id="${slot}"]`) as HTMLElement | null) ||
      (doc.querySelector(`[id*="${slot}"]`) as HTMLElement | null);
    if (!slotEl) return;

    slotEl.style.setProperty('display', 'block', 'important');
    slotEl.style.setProperty('width', '100%', 'important');
    slotEl.style.setProperty('max-width', '100%', 'important');
    slotEl.style.setProperty('min-width', '0', 'important');
    slotEl.style.setProperty('overflow', 'hidden', 'important');
    slotEl.style.setProperty('box-sizing', 'border-box', 'important');

    let p = slotEl.parentElement;
    while (p && !p.classList.contains('page') && !p.classList.contains('cp__sidebar-main-content')) {
      p.style.setProperty('min-width', '0', 'important');
      p.style.setProperty('max-width', '100%', 'important');
      p.style.setProperty('box-sizing', 'border-box', 'important');

      if (p.classList.contains('block-content-wrapper')) {
        p.style.setProperty('flex', '1 1 0%', 'important');
        p.style.setProperty('min-width', '0', 'important');
        p.style.setProperty('width', '100%', 'important');
        p.style.setProperty('overflow', 'hidden', 'important');
      } else if (p.classList.contains('macro') || p.classList.contains('block-content') || p.classList.contains('macro-renderer')) {
        p.style.setProperty('display', 'block', 'important');
        p.style.setProperty('width', '100%', 'important');
        p.style.setProperty('overflow', 'hidden', 'important');
      } else if (p.classList.contains('ls-block')) {
        p.style.setProperty('overflow', 'hidden', 'important');
        break;
      }
      p = p.parentElement;
    }
  }

  /**
   * Render the in-page macro renderer slot for {{renderer :project-dashboard}}
   * Matches the exact layout, components, and visuals of the modal view.
   */
  public async renderMacroSlot(slot: string): Promise<void> {
    this.recordSlot(slot);
    this.tasks = await this.logseqService.fetchTasksForDashboard();

    const template = `
      <div class="ptf-dashboard-card">
        <!-- Dashboard Header -->
        <div class="ptf-dashboard-header">
          <div class="ptf-dashboard-title">
            <span class="ptf-header-icon" style="color: var(--ptf-primary);">${ICONS.kanban}</span>
            <span>Interactive Project Flow & Mindmap</span>
            <span class="ptf-task-count" id="ptf-macro-count-${slot}">${this.tasks.length} tasks</span>
          </div>
          <div class="ptf-dashboard-actions">
            <button class="ptf-btn ptf-btn-primary ptf-btn-sm" data-on-click="openQuickCapture" title="Capture a new task">
              ${ICONS.plus} Quick Task
            </button>
            <button class="ptf-btn ptf-btn-secondary ptf-btn-sm" data-on-click="syncTasksToJournals" title="Sync all scheduled/due tasks to Daily Journal pages for Journals Calendar plugin">
              ${ICONS.refresh} Sync to Journals
            </button>
            <button class="ptf-btn ptf-btn-secondary ptf-btn-sm" data-on-click="openJournalsCalendar" title="Open Today's Journal in Sidebar (Journals Calendar)">
              ${ICONS.calendar} Journals Calendar
            </button>
            <button class="ptf-btn ptf-btn-secondary ptf-btn-sm" data-on-click="openDashboardModal" title="Open Fullscreen Interactive Mindmap & Modal">
              ${ICONS.maximize} Modal View
            </button>
            <button class="ptf-btn ptf-btn-secondary ptf-btn-sm" data-on-click="refreshMacroDashboard" data-slot="${slot}" title="Reload tasks and redraw dashboard">
              ${ICONS.refresh} Refresh
            </button>
          </div>
        </div>

        <div style="display: flex; flex-direction: column; background: var(--ptf-bg);">
          <!-- Summary Table Section -->
          <div id="ptf-macro-table-${slot}" style="width: 100%; max-width: 100%; min-width: 0; box-sizing: border-box;"></div>

          <!-- Mindmap Divider -->
          <div class="ptf-section-divider">
            <div class="ptf-section-title">
              <span class="ptf-header-icon" style="color: var(--ptf-primary);">${ICONS.sitemap}</span>
              <span>Interactive Mindmap View (Zoom, Pan & Collapse Nodes)</span>
            </div>
          </div>

          <!-- Mindmap Section -->
          <div id="ptf-macro-mindmap-${slot}" style="height: 480px; min-height: 400px; width: 100%; max-width: 100%; min-width: 0; position: relative; overflow: hidden; box-sizing: border-box;"></div>

          <!-- Gantt Divider -->
          <div class="ptf-section-divider">
            <div class="ptf-section-title">
              <span class="ptf-header-icon" style="color: var(--ptf-primary);">${ICONS.calendar}</span>
              <span>Project Schedule & Dependencies (Gantt Chart)</span>
            </div>
          </div>

          <!-- Gantt Section -->
          <div id="ptf-macro-gantt-${slot}" style="min-height: 440px; width: 100%; max-width: 100%; min-width: 0; position: relative; padding: 12px 16px; overflow: hidden; box-sizing: border-box;"></div>
        </div>
      </div>
    `;

    logseq.provideUI({
      key: `ptf-macro-${slot}`,
      slot,
      template,
      reset: true,
    });
    this.constrainHostSlot(slot);

    let attempts = 0;
    const interval = setInterval(() => {
      this.constrainHostSlot(slot);
      const tableMount = getDocEl<HTMLElement>(`ptf-macro-table-${slot}`);
      const mmMount = getDocEl<HTMLElement>(`ptf-macro-mindmap-${slot}`);
      const ganttMount = getDocEl<HTMLElement>(`ptf-macro-gantt-${slot}`);

      if ((tableMount && mmMount && ganttMount) || ++attempts >= 25) {
        clearInterval(interval);
        if (tableMount) {
          const table = new SummaryTable(tableMount, () => this.refreshAllSlots());
          table.setTasks(this.tasks);
          this.macroSummaryTables.set(slot, table);
        }
        if (mmMount) {
          this.macroMindmapViewers.get(slot)?.destroy();
          const mm = new MindmapViewer(mmMount);
          mm.setTasks(this.tasks);
          this.macroMindmapViewers.set(slot, mm);
        }
        if (ganttMount) {
          this.macroGanttCharts.get(slot)?.destroy();
          const gantt = new GanttChart(ganttMount);
          gantt.setTasks(this.tasks);
          this.macroGanttCharts.set(slot, gantt);
        }
      }
    }, 40);
  }

  /**
   * Mount and show the interactive modal dashboard with zoom, pan, and collapsible tree
   */
  public async openFullDashboard(container: HTMLElement): Promise<void> {
    this.container = container;
    this.tasks = await this.logseqService.fetchTasksForDashboard();

    this.container.innerHTML = `
      <div class="ptf-modal-overlay" id="ptf-dashboard-overlay">
        <div class="ptf-modal-card" style="max-width: 980px; width: 94vw; max-height: 92vh; display: flex; flex-direction: column;">
          <div class="ptf-modal-header">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span class="ptf-header-icon" style="color: var(--ptf-primary);">${ICONS.kanban}</span>
              <h3>Interactive Project Flow & Mindmap</h3>
              <span class="ptf-task-count" id="ptf-modal-task-count">${this.tasks.length} tasks</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <button class="ptf-btn ptf-btn-secondary ptf-btn-sm" id="ptf-btn-sync-journals" title="Sync all scheduled/due tasks to Daily Journal pages for Journals Calendar plugin">${ICONS.refresh} Sync to Journals</button>
              <button class="ptf-btn ptf-btn-secondary ptf-btn-sm" id="ptf-btn-open-journals" title="Open Today's Journal in Sidebar (Journals Calendar)">${ICONS.calendar} Journals Calendar</button>
              <button class="ptf-btn ptf-btn-secondary ptf-btn-sm" id="ptf-btn-refresh-modal">${ICONS.refresh} Refresh</button>
              <button class="ptf-modal-close" id="ptf-btn-close-dash" title="Close">&times;</button>
            </div>
          </div>

          <div style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; background: var(--ptf-bg);" id="ptf-dashboard-content">
            <!-- Summary Table Section -->
            <div id="ptf-modal-table-mount" style="width: 100%; max-width: 100%; min-width: 0; box-sizing: border-box;"></div>

            <!-- Mindmap Divider -->
            <div class="ptf-section-divider">
              <div class="ptf-section-title">
                <span class="ptf-header-icon" style="color: var(--ptf-primary);">${ICONS.sitemap}</span>
                <span>Interactive Mindmap View (Zoom, Pan & Collapse Nodes)</span>
              </div>
            </div>

            <!-- Mindmap Section -->
            <div id="ptf-modal-mindmap-mount" style="height: 480px; min-height: 400px; width: 100%; max-width: 100%; min-width: 0; position: relative; overflow: hidden; box-sizing: border-box;"></div>

            <!-- Gantt Divider -->
            <div class="ptf-section-divider">
              <div class="ptf-section-title">
                <span class="ptf-header-icon" style="color: var(--ptf-primary);">${ICONS.calendar}</span>
                <span>Project Schedule & Dependencies (Gantt Chart)</span>
              </div>
            </div>

            <!-- Gantt Section -->
            <div id="ptf-modal-gantt-mount" style="min-height: 440px; width: 100%; max-width: 100%; min-width: 0; position: relative; padding: 12px 16px; overflow: hidden; box-sizing: border-box;"></div>
          </div>
        </div>
      </div>
    `;

    logseq.setMainUIInlineStyle({
      position: 'fixed',
      zIndex: 9999,
      inset: '0',
      width: '100vw',
      height: '100vh',
      border: 'none',
      background: 'transparent',
    });
    logseq.showMainUI();

    const overlay = this.container.querySelector('#ptf-dashboard-overlay') as HTMLElement;
    const closeBtn = this.container.querySelector('#ptf-btn-close-dash') as HTMLElement;
    const tableMount = this.container.querySelector('#ptf-modal-table-mount') as HTMLElement;
    const mindmapMount = this.container.querySelector('#ptf-modal-mindmap-mount') as HTMLElement;
    const ganttMount = this.container.querySelector('#ptf-modal-gantt-mount') as HTMLElement;
    const refreshBtn = this.container.querySelector('#ptf-btn-refresh-modal') as HTMLElement;

    this.summaryTable = new SummaryTable(tableMount, () => this.refreshAllSlots());
    this.summaryTable.setTasks(this.tasks);

    this.mindmapViewer = new MindmapViewer(mindmapMount);
    this.mindmapViewer.setTasks(this.tasks);

    if (ganttMount) {
      this.ganttChart = new GanttChart(ganttMount);
      this.ganttChart.setTasks(this.tasks);
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };

    const close = () => {
      window.removeEventListener('keydown', onKeyDown);
      this.mindmapViewer?.destroy();
      this.mindmapViewer = null;
      this.ganttChart?.destroy();
      this.ganttChart = null;
      this.summaryTable = null;
      this.container!.innerHTML = '';
      logseq.hideMainUI();
    };

    closeBtn?.addEventListener('click', close);
    overlay?.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    window.addEventListener('keydown', onKeyDown);

    refreshBtn?.addEventListener('click', async () => {
      await this.refreshAllSlots();
      logseq.UI.showMsg('Dashboard refreshed', 'success');
    });

    const syncJournalsBtn = this.container.querySelector('#ptf-btn-sync-journals') as HTMLElement;
    const openJournalsBtn = this.container.querySelector('#ptf-btn-open-journals') as HTMLElement;

    syncJournalsBtn?.addEventListener('click', async () => {
      syncJournalsBtn.textContent = 'Syncing...';
      const count = await this.logseqService.syncAllTasksToJournals();
      logseq.UI.showMsg(`Synced ${count} task(s) to Daily Journals`, 'success');
      syncJournalsBtn.innerHTML = `${ICONS.refresh} Sync to Journals`;
      await this.refreshAllSlots();
    });

    openJournalsBtn?.addEventListener('click', async () => {
      await this.logseqService.openTodayJournal();
    });
  }
}
