import { LogseqService } from '../services/logseqService';
import { DashboardFilter, ProjectTask } from '../types';

export class SummaryTable {
  private logseqService = LogseqService.getInstance();
  private tasks: ProjectTask[] = [];
  private filter: DashboardFilter = { project: 'ALL', status: 'ALL', search: '' };
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public setTasks(tasks: ProjectTask[]): void {
    this.tasks = tasks;
    this.render();
  }

  public setFilter(partial: Partial<DashboardFilter>): void {
    this.filter = { ...this.filter, ...partial };
    this.render();
  }

  public render(): void {
    const projects = Array.from(new Set(this.tasks.map((t) => t.project))).sort();

    const filtered = this.tasks.filter((t) => {
      if (this.filter.project !== 'ALL' && t.project !== this.filter.project) return false;
      if (this.filter.status !== 'ALL') {
        if (this.filter.status === 'ACTIVE' && t.status === 'DONE') return false;
        if (this.filter.status === 'DONE' && t.status !== 'DONE') return false;
        if (this.filter.status === 'NEXT' && t.status !== 'NEXT') return false;
      }
      if (this.filter.search) {
        const q = this.filter.search.toLowerCase();
        if (!t.title.toLowerCase().includes(q) && !t.project.toLowerCase().includes(q)) return false;
      }
      return true;
    });

    const projectSelectOptions = [
      '<option value="ALL">All Projects</option>',
      ...projects.map((p) => `<option value="${p}" ${this.filter.project === p ? 'selected' : ''}>${p}</option>`),
    ].join('');

    const tableRows = filtered.length > 0
      ? filtered.map((t) => {
          const badgeClass = `ptf-badge ptf-badge-${t.status.toLowerCase()}`;
          return `
            <tr data-uuid="${t.uuid}">
              <td>
                <a class="ptf-link ptf-project-link" data-project="${t.project}">
                  [[${t.project}]]
                </a>
              </td>
              <td>
                <span class="${badgeClass}">${t.status}</span>
                <span style="margin-left: 6px;">${t.title}</span>
              </td>
              <td>${t.scheduled ? `📅 ${t.scheduled}` : '<span style="opacity: 0.5;">—</span>'}</td>
              <td>${t.createdAt || '<span style="opacity: 0.5;">—</span>'}</td>
              <td>${t.completedAt ? `✅ ${t.completedAt}` : '<span style="opacity: 0.5;">—</span>'}</td>
              <td>
                <button class="ptf-btn ptf-btn-secondary ptf-btn-sm ptf-jump-btn" data-uuid="${t.uuid}" data-project="${t.project}">
                  Jump
                </button>
              </td>
            </tr>
          `;
        }).join('')
      : `<tr><td colspan="6" class="ptf-empty-state">No matching tasks found.</td></tr>`;

    this.container.innerHTML = `
      <div style="padding: 8px 12px; display: flex; gap: 10px; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--ptf-border); background: var(--ptf-bg-secondary);">
        <div style="display: flex; gap: 8px; align-items: center;">
          <select id="ptf-filter-project" class="ptf-select" style="padding: 4px 8px; font-size: 12px;">
            ${projectSelectOptions}
          </select>
          <select id="ptf-filter-status" class="ptf-select" style="padding: 4px 8px; font-size: 12px;">
            <option value="ALL" ${this.filter.status === 'ALL' ? 'selected' : ''}>All Statuses</option>
            <option value="ACTIVE" ${this.filter.status === 'ACTIVE' ? 'selected' : ''}>Active / Next (Not Done)</option>
            <option value="NEXT" ${this.filter.status === 'NEXT' ? 'selected' : ''}>NEXT Only</option>
            <option value="DONE" ${this.filter.status === 'DONE' ? 'selected' : ''}>Finished (DONE)</option>
          </select>
        </div>
        <div>
          <input type="text" id="ptf-filter-search" class="ptf-search-input" placeholder="🔍 Search tasks..." value="${this.filter.search}" />
        </div>
      </div>
      <div class="ptf-table-container">
        <table class="ptf-table">
          <thead>
            <tr>
              <th style="width: 18%;">Project</th>
              <th style="width: 38%;">Task</th>
              <th style="width: 14%;">Scheduled</th>
              <th style="width: 12%;">Created</th>
              <th style="width: 12%;">Completed</th>
              <th style="width: 6%;">Action</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </div>
    `;

    // Event listeners
    const projectSelect = this.container.querySelector('#ptf-filter-project') as HTMLSelectElement;
    projectSelect?.addEventListener('change', () => {
      this.filter.project = projectSelect.value;
      this.render();
    });

    const statusSelect = this.container.querySelector('#ptf-filter-status') as HTMLSelectElement;
    statusSelect?.addEventListener('change', () => {
      this.filter.status = statusSelect.value;
      this.render();
    });

    const searchInput = this.container.querySelector('#ptf-filter-search') as HTMLInputElement;
    searchInput?.addEventListener('input', () => {
      this.filter.search = searchInput.value;
      this.render();
      const nextInput = this.container.querySelector('#ptf-filter-search') as HTMLInputElement;
      if (nextInput) {
        nextInput.focus();
        nextInput.setSelectionRange(nextInput.value.length, nextInput.value.length);
      }
    });

    // Jump to block listener
    const jumpBtns = this.container.querySelectorAll('.ptf-jump-btn');
    jumpBtns.forEach((btn) => {
      btn.addEventListener('click', async () => {
        const uuid = (btn as HTMLElement).dataset.uuid;
        const project = (btn as HTMLElement).dataset.project;
        if (uuid && project) {
          await this.logseqService.jumpToBlock({
            uuid,
            project,
            content: '',
            title: '',
            status: 'TODO',
          });
        }
      });
    });

    // Project page navigation
    const projectLinks = this.container.querySelectorAll('.ptf-project-link');
    projectLinks.forEach((link) => {
      link.addEventListener('click', async () => {
        const project = (link as HTMLElement).dataset.project;
        if (project) {
          logseq.Editor.openInRightSidebar(project);
        }
      });
    });
  }
}
