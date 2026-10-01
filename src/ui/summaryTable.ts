import { LogseqService } from '../services/logseqService';
import { DashboardFilter, ProjectTask } from '../types';
import { DependencyModal } from './dependencyModal';
import { ICONS, escapeHtml } from './icons';

export class SummaryTable {
  private logseqService = LogseqService.getInstance();
  private tasks: ProjectTask[] = [];
  private filter: DashboardFilter = { project: 'ALL', status: 'ALL', search: '', priority: 'ALL' };
  private sortColumn: 'project' | 'priority' | 'title' | 'status' | 'scheduled' | 'createdAt' | 'completedAt' | null = null;
  private sortDirection: 'asc' | 'desc' | null = null;
  private container: HTMLElement;
  private isSkeletonRendered = false;

  constructor(container: HTMLElement, private onRefresh?: () => void) {
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

  private handleSortClick(column: 'project' | 'priority' | 'title' | 'status' | 'scheduled' | 'createdAt' | 'completedAt'): void {
    if (this.sortColumn === column) {
      if (this.sortDirection === 'asc') {
        this.sortDirection = 'desc';
      } else if (this.sortDirection === 'desc') {
        this.sortColumn = null;
        this.sortDirection = null;
      }
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }
    this.updateSortIndicators();
    this.renderRows();
  }

  private getSortIndicator(column: string): string {
    if (this.sortColumn === column) {
      return this.sortDirection === 'asc'
        ? '<span class="ptf-sort-icon active">▲</span>'
        : '<span class="ptf-sort-icon active">▼</span>';
    }
    return '<span class="ptf-sort-icon">↕</span>';
  }

  private updateSortIndicators(): void {
    const headers = this.container.querySelectorAll('.ptf-th-sortable');
    headers.forEach((th) => {
      const col = (th as HTMLElement).dataset.col;
      if (!col) return;
      const label = col === 'project' ? 'Project'
        : col === 'priority' ? 'Priority'
        : col === 'title' ? 'Task'
        : col === 'scheduled' ? 'Scheduled'
        : col === 'createdAt' ? 'Created'
        : col === 'completedAt' ? 'Done'
        : col;
      th.innerHTML = `${label} ${this.getSortIndicator(col)}`;
    });
  }

  public render(): void {
    const projectSet = new Set<string>();
    for (const t of this.tasks) {
      if (t.project && t.project !== 'General') projectSet.add(t.project);
    }
    const projects = Array.from(projectSet).sort();
    if (this.tasks.some((t) => t.project === 'General')) {
      projects.push('General');
    }

    const prioSet = new Set<string>();
    this.logseqService.getPriorityCategories().forEach((c) => prioSet.add(c));
    this.tasks.forEach((t) => { if (t.priority) prioSet.add(t.priority); });
    const allPrios = Array.from(prioSet);

    if (!this.isSkeletonRendered) {
      this.renderSkeleton(projects, allPrios);
      this.isSkeletonRendered = true;
    } else {
      this.updateFilterDropdowns(projects, allPrios);
    }

    this.renderRows();
  }

  private updateFilterDropdowns(projects: string[], allPrios: string[]): void {
    const projectSelect = this.container.querySelector('#ptf-filter-project') as HTMLSelectElement | null;
    if (projectSelect) {
      const cur = this.filter.project;
      projectSelect.innerHTML = [
        '<option value="ALL">All Projects</option>',
        ...projects.map((p) => `<option value="${escapeHtml(p)}" ${cur === p ? 'selected' : ''}>${escapeHtml(p)}</option>`),
      ].join('');
    }

    const prioritySelect = this.container.querySelector('#ptf-filter-priority') as HTMLSelectElement | null;
    if (prioritySelect) {
      const cur = this.filter.priority;
      prioritySelect.innerHTML = [
        '<option value="ALL">All Priorities</option>',
        ...allPrios.map((p) => `<option value="${escapeHtml(p)}" ${cur === p ? 'selected' : ''}>#${escapeHtml(p)}</option>`),
      ].join('');
    }
  }

  private renderSkeleton(projects: string[], allPrios: string[]): void {
    const projectSelectOptions = [
      '<option value="ALL">All Projects</option>',
      ...projects.map((p) => `<option value="${escapeHtml(p)}" ${this.filter.project === p ? 'selected' : ''}>${escapeHtml(p)}</option>`),
    ].join('');

    const prioritySelectOptions = [
      '<option value="ALL">All Priorities</option>',
      ...allPrios.map((p) => `<option value="${escapeHtml(p)}" ${this.filter.priority === p ? 'selected' : ''}>#${escapeHtml(p)}</option>`),
    ].join('');

    this.container.innerHTML = `
      <div class="ptf-filter-bar">
        <div class="ptf-filter-group">
          <select id="ptf-filter-project" class="ptf-select ptf-filter-select">
            ${projectSelectOptions}
          </select>
          <select id="ptf-filter-priority" class="ptf-select ptf-filter-select">
            ${prioritySelectOptions}
          </select>
          <select id="ptf-filter-status" class="ptf-select ptf-filter-select">
            <option value="ALL" ${this.filter.status === 'ALL' ? 'selected' : ''}>All Statuses</option>
            <option value="ACTIVE" ${this.filter.status === 'ACTIVE' ? 'selected' : ''}>Active Tasks</option>
            <option value="TODO" ${this.filter.status === 'TODO' ? 'selected' : ''}>TODO</option>
            <option value="DOING" ${this.filter.status === 'DOING' ? 'selected' : ''}>DOING</option>
            <option value="NOW" ${this.filter.status === 'NOW' ? 'selected' : ''}>NOW</option>
            <option value="LATER" ${this.filter.status === 'LATER' ? 'selected' : ''}>LATER</option>
            <option value="WAITING" ${this.filter.status === 'WAITING' ? 'selected' : ''}>WAITING</option>
            <option value="DONE" ${this.filter.status === 'DONE' ? 'selected' : ''}>Completed</option>
          </select>
        </div>
        <div>
          <input type="text" id="ptf-filter-search" class="ptf-search-input" placeholder="Search tasks or tags..." value="${escapeHtml(this.filter.search)}" />
        </div>
      </div>
      <div class="ptf-table-container">
        <table class="ptf-table">
          <thead>
            <tr>
              <th class="ptf-th-check" style="width: 36px; text-align: center;"></th>
              <th class="ptf-th-sortable ptf-th-project" data-col="project" style="width: 16%;">Project ${this.getSortIndicator('project')}</th>
              <th class="ptf-th-sortable" data-col="priority" style="width: 12%;">Priority ${this.getSortIndicator('priority')}</th>
              <th class="ptf-th-sortable ptf-th-title" data-col="title" style="width: auto;">Task ${this.getSortIndicator('title')}</th>
              <th class="ptf-th-sortable ptf-th-date" data-col="scheduled" style="width: 15%;">Scheduled ${this.getSortIndicator('scheduled')}</th>
              <th class="ptf-th-sortable ptf-th-date" data-col="createdAt" style="width: 10%;">Created ${this.getSortIndicator('createdAt')}</th>
              <th class="ptf-th-sortable ptf-th-date" data-col="completedAt" style="width: 10%;">Done ${this.getSortIndicator('completedAt')}</th>
              <th class="ptf-th-action" style="width: 76px; text-align: center;">Action</th>
            </tr>
          </thead>
          <tbody id="ptf-table-tbody"></tbody>
        </table>
      </div>
    `;

    // Filters event listeners
    const projectSelect = this.container.querySelector('#ptf-filter-project') as HTMLSelectElement | null;
    projectSelect?.addEventListener('change', () => {
      this.filter.project = projectSelect.value;
      this.renderRows();
    });

    const prioritySelect = this.container.querySelector('#ptf-filter-priority') as HTMLSelectElement | null;
    prioritySelect?.addEventListener('change', () => {
      this.filter.priority = prioritySelect.value;
      this.renderRows();
    });

    const statusSelect = this.container.querySelector('#ptf-filter-status') as HTMLSelectElement | null;
    statusSelect?.addEventListener('change', () => {
      this.filter.status = statusSelect.value;
      this.renderRows();
    });

    const searchInput = this.container.querySelector('#ptf-filter-search') as HTMLInputElement | null;
    searchInput?.addEventListener('input', () => {
      this.filter.search = searchInput.value;
      this.renderRows();
    });

    // Column Sorting
    const sortableHeaders = this.container.querySelectorAll('.ptf-th-sortable');
    sortableHeaders.forEach((th) => {
      th.addEventListener('click', () => {
        const col = (th as HTMLElement).dataset.col as any;
        if (col) this.handleSortClick(col);
      });
    });
  }

  private renderRows(): void {
    const tbody = this.container.querySelector('#ptf-table-tbody') as HTMLElement | null;
    if (!tbody) return;

    let filtered = this.tasks.filter((t) => {
      if (this.filter.project !== 'ALL' && t.project !== this.filter.project) return false;
      if (this.filter.priority && this.filter.priority !== 'ALL') {
        if ((t.priority || '').toLowerCase() !== this.filter.priority.toLowerCase()) return false;
      }
      if (this.filter.status !== 'ALL') {
        if (this.filter.status === 'ACTIVE' && (t.status === 'DONE' || t.status === 'CANCELLED')) return false;
        if (this.filter.status === 'DONE' && t.status !== 'DONE') return false;
        if (this.filter.status !== 'ACTIVE' && this.filter.status !== 'DONE' && t.status !== this.filter.status) return false;
      }
      if (this.filter.search) {
        const q = this.filter.search.toLowerCase();
        if (!t.title.toLowerCase().includes(q) && !t.project.toLowerCase().includes(q) && !(t.priority && t.priority.toLowerCase().includes(q))) return false;
      }
      return true;
    });

    if (this.sortColumn && this.sortDirection) {
      const dir = this.sortDirection === 'asc' ? 1 : -1;
      const col = this.sortColumn;
      const prioRank = (p?: string) => {
        if (!p) return 999;
        const low = p.toLowerCase();
        if (low === 'important') return 1;
        if (low === 'normal') return 2;
        if (low === 'hobby') return 3;
        return 10;
      };

      filtered.sort((a, b) => {
        if (col === 'priority') {
          const rankA = prioRank(a.priority);
          const rankB = prioRank(b.priority);
          if (rankA !== rankB) return (rankA - rankB) * dir;
          return ((a.priority || '').localeCompare(b.priority || '')) * dir;
        }
        const valA = ((a as any)[col] || '').toString().toLowerCase();
        const valB = ((b as any)[col] || '').toString().toLowerCase();
        return valA.localeCompare(valB) * dir;
      });
    }

    const tableRows = filtered.length > 0
      ? filtered.map((t) => {
          const badgeClass = `ptf-badge ptf-badge-${t.status.toLowerCase()}`;
          const isDone = t.status === 'DONE';
          const lowerPrio = (t.priority || '').toLowerCase();
          const prioClass = lowerPrio === 'important'
            ? 'ptf-priority-important'
            : lowerPrio === 'normal'
            ? 'ptf-priority-normal'
            : lowerPrio === 'hobby'
            ? 'ptf-priority-hobby'
            : 'ptf-priority-custom';

          let isOverdue = false;
          if (t.deadline && !isDone && t.status !== 'CANCELLED') {
            const m = t.deadline.match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (m) {
              const dEnd = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10), 23, 59, 59);
              if (new Date() > dEnd) isOverdue = true;
            }
          }

          return `
            <tr data-uuid="${t.uuid}" class="ptf-row ${isDone ? 'ptf-row-done' : ''} ${isOverdue ? 'ptf-row-overdue' : ''}">
              <td class="ptf-cell-check">
                <input
                  type="checkbox"
                  class="ptf-checkbox ptf-task-toggle"
                  data-uuid="${t.uuid}"
                  ${isDone ? 'checked' : ''}
                  title="${isDone ? 'Reopen task' : 'Mark as completed'}"
                />
              </td>
              <td class="ptf-cell-project" title="${escapeHtml(t.project)}">
                ${t.project && t.project !== 'General'
                  ? `<a class="ptf-link ptf-project-link" data-project="${t.project}" data-page="${t.pageName || ''}" title="Open [[${t.project}]] in sidebar">
                      [[${escapeHtml(t.project)}]]
                    </a>`
                  : `<span class="ptf-badge-general" title="General task">General</span>`
                }
              </td>
              <td class="ptf-cell-priority">
                ${t.priority ? `<span class="ptf-priority-tag ${prioClass}">#${escapeHtml(t.priority)}</span>` : '<span class="ptf-muted-dash">—</span>'}
              </td>
              <td class="ptf-cell-title" title="${escapeHtml(t.title)}">
                <div class="ptf-title-content">
                  <span class="${badgeClass}">${t.status}</span>
                  <button type="button" class="ptf-dep-badge ${t.dependsOn && t.dependsOn.length > 0 ? 'ptf-dep-badge-active' : 'ptf-dep-badge-muted'} ptf-dep-edit-btn" data-uuid="${t.uuid}" title="${t.dependsOn && t.dependsOn.length > 0 ? `Depends on ${t.dependsOn.length} task(s) - click to edit` : 'Edit dependencies'}">🔗${t.dependsOn && t.dependsOn.length > 0 ? ` ${t.dependsOn.length}` : ''}</button>
                  <span class="ptf-task-title ${isDone ? 'ptf-task-done' : ''}">${escapeHtml(t.title)}</span>
                </div>
              </td>
              <td class="ptf-cell-date">
                <div style="display: flex; flex-direction: column; gap: 2px;">
                  <div>${t.scheduled || '—'} ${t.repeating ? `<span class="ptf-recur-pill" title="Repeats: ${escapeHtml(t.repeating)}">🔁 ${escapeHtml(t.repeating)}</span>` : ''}</div>
                  ${t.deadline ? `<span class="ptf-deadline-sub ${isOverdue ? 'ptf-deadline-overdue' : ''}" title="${isOverdue ? 'Overdue deadline!' : 'Deadline / Due Date'}">${isOverdue ? '⚠️ ' : '⏳ '}${escapeHtml(t.deadline)}${isOverdue ? ' (Overdue)' : ''}</span>` : ''}
                </div>
              </td>
              <td class="ptf-cell-date">${t.createdAt || '—'}</td>
              <td class="ptf-cell-date">${t.completedAt || '—'}</td>
              <td class="ptf-cell-action">
                <div style="display: flex; gap: 4px; align-items: center;">
                  <button class="ptf-btn ptf-btn-secondary ptf-btn-sm ptf-jump-btn" data-uuid="${t.uuid}" data-project="${t.project}" data-page="${t.pageName || ''}" title="Jump to Block">
                    Jump ${ICONS.externalLink}
                  </button>
                  <button class="ptf-btn ptf-btn-secondary ptf-btn-sm ptf-delete-task-btn" data-uuid="${t.uuid}" data-title="${escapeHtml(t.title)}" title="Delete Task & Remove from Calendar" style="color: #e53e3e; padding: 4px 6px;">
                    🗑️
                  </button>
                </div>
              </td>
            </tr>
          `;
        }).join('')
      : `<tr><td colspan="8" class="ptf-empty-state">No matching tasks found.</td></tr>`;

    tbody.innerHTML = tableRows;

    // Direct Task Checkbox Toggle (Optimistic UI)
    const toggleBoxes = tbody.querySelectorAll('.ptf-task-toggle');
    toggleBoxes.forEach((box) => {
      box.addEventListener('change', async (e) => {
        const checkbox = e.target as HTMLInputElement;
        const uuid = checkbox.dataset.uuid;
        const task = this.tasks.find((t) => t.uuid === uuid);
        if (!uuid || !task) return;

        const isChecking = checkbox.checked;
        const oldStatus = task.status;
        const optimisticStatus = isChecking ? 'DONE' : 'TODO';

        task.status = optimisticStatus;
        task.completedAt = isChecking ? new Date().toISOString().slice(0, 10) : undefined;
        this.renderRows();

        try {
          const finalStatus = await this.logseqService.toggleTaskStatus(uuid, oldStatus);
          task.status = finalStatus;
          if (finalStatus !== 'DONE') {
            task.completedAt = undefined;
          }
          this.renderRows();
        } catch (err) {
          task.status = oldStatus;
          this.renderRows();
        }
      });
    });

    // Edit dependencies
    const depEditBtns = tbody.querySelectorAll('.ptf-dep-edit-btn');
    depEditBtns.forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const uuid = (btn as HTMLElement).dataset.uuid;
        const task = this.tasks.find((t) => t.uuid === uuid);
        if (task) {
          await DependencyModal.getInstance().open(task);
        }
      });
    });

    // Jump to block
    const jumpBtns = tbody.querySelectorAll('.ptf-jump-btn');
    jumpBtns.forEach((btn) => {
      btn.addEventListener('click', async () => {
        const uuid = (btn as HTMLElement).dataset.uuid;
        const project = (btn as HTMLElement).dataset.project;
        const page = (btn as HTMLElement).dataset.page;
        if (uuid) {
          await this.logseqService.jumpToBlock({
            uuid,
            project,
            pageName: page,
          });
          logseq.hideMainUI();
        }
      });
    });

    // Delete task
    const deleteBtns = tbody.querySelectorAll('.ptf-delete-task-btn');
    deleteBtns.forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const uuid = (btn as HTMLElement).dataset.uuid;
        const title = (btn as HTMLElement).dataset.title || 'this task';
        if (!uuid) return;

        const ok = window.confirm(`Delete task "${title}" and remove from calendar?`);
        if (!ok) return;

        await this.logseqService.deleteTask(uuid);
        this.tasks = this.tasks.filter((t) => t.uuid !== uuid);
        this.renderRows();
        this.onRefresh?.();
      });
    });

    // Project links
    const projectLinks = tbody.querySelectorAll('.ptf-project-link');
    projectLinks.forEach((link) => {
      link.addEventListener('click', async () => {
        const project = (link as HTMLElement).dataset.project;
        const page = (link as HTMLElement).dataset.page;
        if (project && project !== 'General') {
          const existing = await logseq.Editor.getPage(project);
          if (!existing) {
            await logseq.Editor.createPage(project);
          }
          await logseq.Editor.openInRightSidebar(project);
        } else if (page && page !== 'General') {
          await logseq.Editor.openInRightSidebar(page);
        } else {
          await logseq.Editor.openInRightSidebar('Projects & Tasks');
        }
      });
    });
  }
}
