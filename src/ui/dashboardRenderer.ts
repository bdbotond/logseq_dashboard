import { LogseqService } from '../services/logseqService';
import { ProjectTask } from '../types';
import { MindmapViewer } from './mindmap';
import { SummaryTable } from './summaryTable';

export class DashboardRenderer {
  private static instance: DashboardRenderer;
  private logseqService = LogseqService.getInstance();
  private container: HTMLElement | null = null;
  private summaryTable: SummaryTable | null = null;
  private mindmapViewer: MindmapViewer | null = null;
  private activeTab: 'table' | 'mindmap' = 'table';
  private tasks: ProjectTask[] = [];

  public static getInstance(): DashboardRenderer {
    if (!DashboardRenderer.instance) {
      DashboardRenderer.instance = new DashboardRenderer();
    }
    return DashboardRenderer.instance;
  }

  /**
   * Render the in-page macro renderer slot for {{renderer :project-dashboard}}
   */
  public async renderMacroSlot(slot: string): Promise<void> {
    const tasks = await this.logseqService.fetchTasksForDashboard();
    const rows = tasks.map((t) => {
      const badgeColor =
        t.status === 'DONE'
          ? '#38a169'
          : t.status === 'NEXT'
          ? '#dd6b20'
          : t.status === 'DOING'
          ? '#805ad5'
          : '#3182ce';

      return `
        <tr style="border-bottom: 1px solid var(--ls-border-color, #e2e8f0);">
          <td style="padding: 8px 10px; font-weight: 600;">
            <a data-on-click="openProjectPage" data-project="${t.project}" style="color: var(--ls-link-text-color, #3182ce); cursor: pointer; text-decoration: none;">
              [[${t.project}]]
            </a>
          </td>
          <td style="padding: 8px 10px;">
            <span style="display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: bold; color: #fff; background: ${badgeColor};">
              ${t.status}
            </span>
            <span style="margin-left: 6px; color: var(--ls-primary-text-color, #2d3748);">${t.title}</span>
          </td>
          <td style="padding: 8px 10px; color: var(--ls-secondary-text-color, #718096);">${t.scheduled ? `📅 ${t.scheduled}` : '—'}</td>
          <td style="padding: 8px 10px; color: var(--ls-secondary-text-color, #718096);">${t.createdAt || '—'}</td>
          <td style="padding: 8px 10px; color: var(--ls-secondary-text-color, #718096);">${t.completedAt ? `✅ ${t.completedAt}` : '—'}</td>
        </tr>
      `;
    }).join('');

    const template = `
      <div style="margin: 12px 0; border: 1px solid var(--ls-border-color, #e2e8f0); border-radius: 8px; background: var(--ls-primary-background-color, #ffffff); overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.05); font-family: sans-serif;">
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: var(--ls-secondary-background-color, #f8f9fa); border-bottom: 1px solid var(--ls-border-color, #e2e8f0);">
          <div style="font-weight: 700; font-size: 14px; color: var(--ls-primary-text-color, #2d3748); display: flex; align-items: center; gap: 6px;">
            <span>📊 Project Tasks & Milestones</span>
            <span style="font-size: 12px; font-weight: normal; color: var(--ls-secondary-text-color, #718096);">(${tasks.length} total)</span>
          </div>
          <div style="display: flex; gap: 8px;">
            <button data-on-click="openQuickCapture" style="padding: 5px 10px; font-size: 12px; font-weight: 600; border-radius: 6px; border: 1px solid var(--ls-border-color, #cbd5e0); background: var(--ls-primary-background-color, #fff); color: var(--ls-primary-text-color, #333); cursor: pointer;">
              ⚡ Quick Task
            </button>
            <button data-on-click="openDashboardModal" style="padding: 5px 10px; font-size: 12px; font-weight: 600; border-radius: 6px; border: none; background: var(--ls-link-text-color, #3182ce); color: #fff; cursor: pointer;">
              🧠 Live Mindmap View
            </button>
            <button data-on-click="refreshMacroDashboard" data-slot="${slot}" style="padding: 5px 8px; font-size: 12px; border-radius: 6px; border: 1px solid var(--ls-border-color, #cbd5e0); background: transparent; cursor: pointer;" title="Refresh Table">
              🔄
            </button>
          </div>
        </div>

        <div style="max-height: 400px; overflow-y: auto;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left;">
            <thead>
              <tr style="background: var(--ls-secondary-background-color, #f8f9fa); border-bottom: 2px solid var(--ls-border-color, #e2e8f0); color: var(--ls-secondary-text-color, #718096);">
                <th style="padding: 8px 10px; width: 20%;">Project</th>
                <th style="padding: 8px 10px; width: 40%;">Task</th>
                <th style="padding: 8px 10px; width: 15%;">Scheduled</th>
                <th style="padding: 8px 10px; width: 12%;">Created</th>
                <th style="padding: 8px 10px; width: 13%;">Finished</th>
              </tr>
            </thead>
            <tbody>
              ${rows.length > 0 ? rows : '<tr><td colspan="5" style="padding: 24px; text-align: center; color: var(--ls-secondary-text-color, #718096);">No tasks tracked yet. Use Quick Task to add tasks to your projects!</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;

    logseq.provideUI({
      key: `project-dashboard-${slot}`,
      slot,
      template,
      reset: true,
    });
  }

  /**
   * Mount and show the full interactive modal dashboard (Table + Mindmap) in iframe
   */
  public async openFullDashboard(container: HTMLElement, initialTab: 'table' | 'mindmap' = 'table'): Promise<void> {
    this.container = container;
    this.activeTab = initialTab;
    this.tasks = await this.logseqService.fetchTasksForDashboard();

    this.container.innerHTML = `
      <div class="ptf-modal-overlay" id="ptf-dashboard-overlay">
        <div class="ptf-modal-card" style="max-width: 900px; width: 92vw; max-height: 90vh; display: flex; flex-direction: column;">
          <div class="ptf-modal-header">
            <div style="display: flex; align-items: center; gap: 12px;">
              <h3>📊 Project Task Flow & Mindmap</h3>
              <div class="ptf-tabs">
                <button class="ptf-tab-btn ${this.activeTab === 'table' ? 'active' : ''}" id="ptf-tab-table">📋 Summary Table</button>
                <button class="ptf-tab-btn ${this.activeTab === 'mindmap' ? 'active' : ''}" id="ptf-tab-mindmap">🧠 Live Mindmap</button>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <button class="ptf-btn ptf-btn-secondary ptf-btn-sm" id="ptf-btn-refresh-dash">🔄 Refresh</button>
              <button class="ptf-modal-close" id="ptf-btn-close-dash">&times;</button>
            </div>
          </div>

          <div style="flex: 1; overflow: hidden; display: flex; flex-direction: column;" id="ptf-dashboard-content">
            <div id="ptf-table-mount" style="${this.activeTab === 'table' ? 'display: block;' : 'display: none;'} flex: 1; overflow-y: auto;"></div>
            <div id="ptf-mindmap-mount" style="${this.activeTab === 'mindmap' ? 'display: block;' : 'display: none;'} flex: 1; height: 560px;"></div>
          </div>
        </div>
      </div>
    `;

    logseq.showMainUI();

    const overlay = document.getElementById('ptf-dashboard-overlay');
    const closeBtn = document.getElementById('ptf-btn-close-dash');
    const tabTable = document.getElementById('ptf-tab-table');
    const tabMindmap = document.getElementById('ptf-tab-mindmap');
    const tableMount = document.getElementById('ptf-table-mount') as HTMLElement;
    const mindmapMount = document.getElementById('ptf-mindmap-mount') as HTMLElement;
    const refreshBtn = document.getElementById('ptf-btn-refresh-dash');

    // Instantiate subcomponents
    this.summaryTable = new SummaryTable(tableMount);
    this.summaryTable.setTasks(this.tasks);

    this.mindmapViewer = new MindmapViewer(mindmapMount);
    this.mindmapViewer.setTasks(this.tasks);

    const switchTab = (tab: 'table' | 'mindmap') => {
      this.activeTab = tab;
      if (tab === 'table') {
        tabTable?.classList.add('active');
        tabMindmap?.classList.remove('active');
        tableMount.style.display = 'block';
        mindmapMount.style.display = 'none';
      } else {
        tabMindmap?.classList.add('active');
        tabTable?.classList.remove('active');
        tableMount.style.display = 'none';
        mindmapMount.style.display = 'block';
        this.mindmapViewer?.render();
      }
    };

    tabTable?.addEventListener('click', () => switchTab('table'));
    tabMindmap?.addEventListener('click', () => switchTab('mindmap'));

    const close = () => {
      this.mindmapViewer?.destroy();
      this.mindmapViewer = null;
      this.summaryTable = null;
      this.container!.innerHTML = '';
      logseq.hideMainUI();
    };

    closeBtn?.addEventListener('click', close);
    overlay?.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    }, { once: true });

    refreshBtn?.addEventListener('click', async () => {
      this.tasks = await this.logseqService.fetchTasksForDashboard();
      this.summaryTable?.setTasks(this.tasks);
      this.mindmapViewer?.setTasks(this.tasks);
      logseq.UI.showMsg('Dashboard refreshed', 'success');
    });

    if (this.activeTab === 'mindmap') {
      switchTab('mindmap');
    }
  }
}
