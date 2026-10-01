import { LogseqService } from '../services/logseqService';
import { ProjectTask, TaskDependency } from '../types';
import { DashboardRenderer } from './dashboardRenderer';
import { ICONS, escapeHtml } from './icons';

export class DependencyModal {
  private static instance: DependencyModal;
  private logseqService = LogseqService.getInstance();
  private modalEl: HTMLElement | null = null;

  public static getInstance(): DependencyModal {
    if (!DependencyModal.instance) {
      DependencyModal.instance = new DependencyModal();
    }
    return DependencyModal.instance;
  }

  public async open(task: ProjectTask): Promise<void> {
    this.close(); // Clean up existing if open

    const allTasks = await this.logseqService.fetchTasksForDashboard();
    const taskMap = new Map(allTasks.map((t) => [t.uuid, t]));

    // Current predecessors (tasks this task depends on)
    const predecessors: TaskDependency[] = (task.dependsOn || []).map((predUuid) => ({
      uuid: predUuid,
      title: taskMap.get(predUuid)?.title || 'Task',
    }));

    // Current successors (tasks in allTasks that depend on task.uuid)
    const originalSuccessors = allTasks.filter((t) =>
      Array.isArray(t.dependsOn) && t.dependsOn.includes(task.uuid)
    );
    const successors: TaskDependency[] = originalSuccessors.map((t) => ({
      uuid: t.uuid,
      title: t.title,
    }));

    const hasDashboardOverlay = !!document.getElementById('ptf-dashboard-overlay');

    logseq.setMainUIInlineStyle({
      position: 'fixed',
      zIndex: 10001,
      inset: '0',
      width: '100vw',
      height: '100vh',
      border: 'none',
      background: 'transparent',
    });
    logseq.showMainUI();

    const overlay = document.createElement('div');
    overlay.className = 'ptf-modal-overlay';
    overlay.id = 'ptf-dependency-modal-overlay';
    overlay.style.zIndex = '10002';

    const safeTitle = escapeHtml(task.title);
    const safeProject = escapeHtml(task.project);

    overlay.innerHTML = `
      <div class="ptf-modal-card ptf-modal-card-lg" style="max-width: 600px;">
        <div class="ptf-modal-header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="ptf-header-icon" style="color: var(--ptf-primary); font-size: 16px;">🔗</span>
            <div>
              <h3 style="margin: 0; font-size: 15px;">Edit Dependencies</h3>
              <div style="font-size: 12px; color: var(--ptf-text-muted); font-weight: normal; margin-top: 2px;">
                <span>${safeTitle}</span> &bull; <span style="color: var(--ptf-primary);">[[${safeProject}]]</span>
              </div>
            </div>
          </div>
          <button class="ptf-modal-close" id="ptf-dep-modal-close" title="Close">&times;</button>
        </div>

        <div class="ptf-modal-body" style="padding: 18px 20px; display: flex; flex-direction: column; gap: 18px;">
          <!-- Predecessors Section -->
          <div class="ptf-form-group">
            <div style="display: flex; justify-content: space-between; align-items: baseline;">
              <label for="ptf-edit-pred-input" style="font-weight: 600;">Predecessors (Must finish before this task)</label>
              <span style="font-size: 11px; color: var(--ptf-text-muted);">This task depends on these</span>
            </div>
            <div class="ptf-combobox-wrap">
              <div class="ptf-chips-wrap" id="ptf-edit-pred-chips"></div>
              <input
                type="text"
                id="ptf-edit-pred-input"
                class="ptf-input"
                placeholder="Type to search and add prerequisite task..."
                autocomplete="off"
              />
              <div id="ptf-edit-pred-list" class="ptf-combobox-list"></div>
            </div>
          </div>

          <!-- Successors Section -->
          <div class="ptf-form-group">
            <div style="display: flex; justify-content: space-between; align-items: baseline;">
              <label for="ptf-edit-succ-input" style="font-weight: 600;">Successors (Waiting on this task)</label>
              <span style="font-size: 11px; color: var(--ptf-text-muted);">These tasks depend on this</span>
            </div>
            <div class="ptf-combobox-wrap">
              <div class="ptf-chips-wrap" id="ptf-edit-succ-chips"></div>
              <input
                type="text"
                id="ptf-edit-succ-input"
                class="ptf-input"
                placeholder="Type to search and link dependent task..."
                autocomplete="off"
              />
              <div id="ptf-edit-succ-list" class="ptf-combobox-list"></div>
            </div>
          </div>

          <div class="ptf-modal-footer" style="margin-top: 10px; display: flex; justify-content: flex-end; gap: 10px;">
            <button type="button" class="ptf-btn ptf-btn-secondary" id="ptf-dep-modal-cancel">Cancel</button>
            <button type="button" class="ptf-btn ptf-btn-primary" id="ptf-dep-modal-save">Save & Sync</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this.modalEl = overlay;

    // Elements
    const closeBtn = overlay.querySelector('#ptf-dep-modal-close') as HTMLElement;
    const cancelBtn = overlay.querySelector('#ptf-dep-modal-cancel') as HTMLElement;
    const saveBtn = overlay.querySelector('#ptf-dep-modal-save') as HTMLButtonElement;

    const predChips = overlay.querySelector('#ptf-edit-pred-chips') as HTMLElement;
    const predInput = overlay.querySelector('#ptf-edit-pred-input') as HTMLInputElement;
    const predList = overlay.querySelector('#ptf-edit-pred-list') as HTMLElement;

    const succChips = overlay.querySelector('#ptf-edit-succ-chips') as HTMLElement;
    const succInput = overlay.querySelector('#ptf-edit-succ-input') as HTMLInputElement;
    const succList = overlay.querySelector('#ptf-edit-succ-list') as HTMLElement;

    let selectedPredIdx = -1;
    let selectedSuccIdx = -1;

    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!predInput?.contains(target) && !predList?.contains(target)) {
        predList?.classList.remove('open');
      }
      if (!succInput?.contains(target) && !succList?.contains(target)) {
        succList?.classList.remove('open');
      }
    };
    document.addEventListener('click', onDocClick);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        doClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    // Helper: close modal safely
    const doClose = () => {
      document.removeEventListener('click', onDocClick);
      window.removeEventListener('keydown', onKeyDown);
      this.close();
      if (!hasDashboardOverlay) {
        logseq.hideMainUI();
      } else {
        logseq.setMainUIInlineStyle({
          position: 'fixed',
          zIndex: 9999,
          inset: '0',
          width: '100vw',
          height: '100vh',
          border: 'none',
          background: 'transparent',
        });
      }
    };

    closeBtn?.addEventListener('click', doClose);
    cancelBtn?.addEventListener('click', doClose);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) doClose();
    });

    // Predecessors Chips
    const renderPredChips = () => {
      if (predecessors.length === 0) {
        predChips.innerHTML = '';
        predChips.style.display = 'none';
        return;
      }
      predChips.style.display = 'flex';
      predChips.innerHTML = predecessors.map((d, i) => `
        <span class="ptf-chip">
          <span class="ptf-chip-text">${d.title}</span>
          <button type="button" class="ptf-chip-remove" data-idx="${i}" title="Remove">&times;</button>
        </span>
      `).join('');

      predChips.querySelectorAll('.ptf-chip-remove').forEach((b) => {
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          const idx = parseInt((b as HTMLElement).dataset.idx || '0', 10);
          predecessors.splice(idx, 1);
          renderPredChips();
        });
      });
    };

    // Predecessors Dropdown
    const renderPredDropdown = (query: string) => {
      const q = query.trim().toLowerCase();
      const currentProj = task.project.toLowerCase();
      const excluded = new Set([
        task.uuid,
        ...predecessors.map((p) => p.uuid),
        ...successors.map((s) => s.uuid),
      ]);

      const available = allTasks.filter((t) => !excluded.has(t.uuid));
      const filtered = available.filter((t) => {
        if (!q) return true;
        return t.title.toLowerCase().includes(q) || t.project.toLowerCase().includes(q);
      });

      filtered.sort((a, b) => {
        const aSame = a.project.toLowerCase() === currentProj ? 0 : 1;
        const bSame = b.project.toLowerCase() === currentProj ? 0 : 1;
        if (aSame !== bSame) return aSame - bSame;
        return a.title.localeCompare(b.title);
      });

      const top = filtered.slice(0, 15);
      if (top.length > 0) {
        predList.innerHTML = top.map((t, idx) => `
          <div class="ptf-combobox-item ptf-dep-pred-item" data-index="${idx}" data-uuid="${t.uuid}" data-title="${t.title.replace(/"/g, '&quot;')}">
            <span style="font-weight: 500;">${t.title}</span>
            <span style="font-size: 11px; color: var(--ptf-text-muted); margin-left: 8px;">[${t.project}]</span>
          </div>
        `).join('');
        predList.classList.add('open');
      } else {
        predList.innerHTML = '<div class="ptf-combobox-item" style="color: var(--ptf-text-muted); cursor: default;">No matching tasks found</div>';
        predList.classList.add('open');
      }
      selectedPredIdx = -1;
      updateActivePredItem();
    };

    const updateActivePredItem = () => {
      const items = predList.querySelectorAll('.ptf-dep-pred-item');
      items.forEach((item, idx) => {
        if (idx === selectedPredIdx) {
          item.classList.add('active');
          (item as HTMLElement).scrollIntoView({ block: 'nearest' });
        } else {
          item.classList.remove('active');
        }
      });
    };

    predInput?.addEventListener('focus', () => renderPredDropdown(predInput.value));
    predInput?.addEventListener('input', () => renderPredDropdown(predInput.value));
    predInput?.addEventListener('keydown', (e) => {
      const items = predList.querySelectorAll('.ptf-dep-pred-item');
      if (!predList.classList.contains('open') || items.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedPredIdx = (selectedPredIdx + 1) % items.length;
        updateActivePredItem();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedPredIdx = (selectedPredIdx - 1 + items.length) % items.length;
        updateActivePredItem();
      } else if (e.key === 'Enter' && selectedPredIdx >= 0) {
        e.preventDefault();
        const selected = items[selectedPredIdx] as HTMLElement;
        if (selected?.dataset.uuid) {
          predecessors.push({
            uuid: selected.dataset.uuid,
            title: selected.dataset.title || 'Task',
          });
          renderPredChips();
          predInput.value = '';
          predList.classList.remove('open');
        }
      } else if (e.key === 'Escape') {
        predList.classList.remove('open');
      }
    });

    predList?.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest('.ptf-dep-pred-item') as HTMLElement;
      if (target?.dataset.uuid) {
        predecessors.push({
          uuid: target.dataset.uuid,
          title: target.dataset.title || 'Task',
        });
        renderPredChips();
        predInput.value = '';
        predList.classList.remove('open');
      }
    });

    // Successors Chips
    const renderSuccChips = () => {
      if (successors.length === 0) {
        succChips.innerHTML = '';
        succChips.style.display = 'none';
        return;
      }
      succChips.style.display = 'flex';
      succChips.innerHTML = successors.map((d, i) => `
        <span class="ptf-chip">
          <span class="ptf-chip-text">${d.title}</span>
          <button type="button" class="ptf-chip-remove" data-idx="${i}" title="Remove">&times;</button>
        </span>
      `).join('');

      succChips.querySelectorAll('.ptf-chip-remove').forEach((b) => {
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          const idx = parseInt((b as HTMLElement).dataset.idx || '0', 10);
          successors.splice(idx, 1);
          renderSuccChips();
        });
      });
    };

    // Successors Dropdown
    const renderSuccDropdown = (query: string) => {
      const q = query.trim().toLowerCase();
      const currentProj = task.project.toLowerCase();
      const excluded = new Set([
        task.uuid,
        ...predecessors.map((p) => p.uuid),
        ...successors.map((s) => s.uuid),
      ]);

      const available = allTasks.filter((t) => !excluded.has(t.uuid));
      const filtered = available.filter((t) => {
        if (!q) return true;
        return t.title.toLowerCase().includes(q) || t.project.toLowerCase().includes(q);
      });

      filtered.sort((a, b) => {
        const aSame = a.project.toLowerCase() === currentProj ? 0 : 1;
        const bSame = b.project.toLowerCase() === currentProj ? 0 : 1;
        if (aSame !== bSame) return aSame - bSame;
        return a.title.localeCompare(b.title);
      });

      const top = filtered.slice(0, 15);
      if (top.length > 0) {
        succList.innerHTML = top.map((t, idx) => `
          <div class="ptf-combobox-item ptf-dep-succ-item" data-index="${idx}" data-uuid="${t.uuid}" data-title="${t.title.replace(/"/g, '&quot;')}">
            <span style="font-weight: 500;">${t.title}</span>
            <span style="font-size: 11px; color: var(--ptf-text-muted); margin-left: 8px;">[${t.project}]</span>
          </div>
        `).join('');
        succList.classList.add('open');
      } else {
        succList.innerHTML = '<div class="ptf-combobox-item" style="color: var(--ptf-text-muted); cursor: default;">No matching tasks found</div>';
        succList.classList.add('open');
      }
      selectedSuccIdx = -1;
      updateActiveSuccItem();
    };

    const updateActiveSuccItem = () => {
      const items = succList.querySelectorAll('.ptf-dep-succ-item');
      items.forEach((item, idx) => {
        if (idx === selectedSuccIdx) {
          item.classList.add('active');
          (item as HTMLElement).scrollIntoView({ block: 'nearest' });
        } else {
          item.classList.remove('active');
        }
      });
    };

    succInput?.addEventListener('focus', () => renderSuccDropdown(succInput.value));
    succInput?.addEventListener('input', () => renderSuccDropdown(succInput.value));
    succInput?.addEventListener('keydown', (e) => {
      const items = succList.querySelectorAll('.ptf-dep-succ-item');
      if (!succList.classList.contains('open') || items.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedSuccIdx = (selectedSuccIdx + 1) % items.length;
        updateActiveSuccItem();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedSuccIdx = (selectedSuccIdx - 1 + items.length) % items.length;
        updateActiveSuccItem();
      } else if (e.key === 'Enter' && selectedSuccIdx >= 0) {
        e.preventDefault();
        const selected = items[selectedSuccIdx] as HTMLElement;
        if (selected?.dataset.uuid) {
          successors.push({
            uuid: selected.dataset.uuid,
            title: selected.dataset.title || 'Task',
          });
          renderSuccChips();
          succInput.value = '';
          succList.classList.remove('open');
        }
      } else if (e.key === 'Escape') {
        succList.classList.remove('open');
      }
    });

    succList?.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest('.ptf-dep-succ-item') as HTMLElement;
      if (target?.dataset.uuid) {
        successors.push({
          uuid: target.dataset.uuid,
          title: target.dataset.title || 'Task',
        });
        renderSuccChips();
        succInput.value = '';
        succList.classList.remove('open');
      }
    });

    renderPredChips();
    renderSuccChips();

    // Save handler
    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';

      try {
        // 1. Update predecessors for this task
        await this.logseqService.setTaskDependencies(task.uuid, predecessors);

        // 2. Sync successors
        const currentSuccUuids = new Set(successors.map((s) => s.uuid));
        const originalSuccUuids = new Set(originalSuccessors.map((s) => s.uuid));

        // Successors to remove
        for (const orig of originalSuccessors) {
          if (!currentSuccUuids.has(orig.uuid)) {
            await this.logseqService.removeDependencyFromTask(orig.uuid, task.uuid);
          }
        }

        // Successors to add
        for (const succ of successors) {
          if (!originalSuccUuids.has(succ.uuid)) {
            await this.logseqService.addDependencyToTask(succ.uuid, {
              uuid: task.uuid,
              title: task.title,
            });
          }
        }

        doClose();
        logseq.UI.showMsg('Dependencies updated successfully', 'success');
        await DashboardRenderer.getInstance().refreshAllSlots();
      } catch (err) {
        console.error('[ProjectTaskFlow] Error updating dependencies:', err);
        logseq.UI.showMsg(`Error saving dependencies: ${err}`, 'error');
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save & Sync';
      }
    });
  }

  public close(): void {
    if (this.modalEl && this.modalEl.parentNode) {
      this.modalEl.parentNode.removeChild(this.modalEl);
      this.modalEl = null;
    }
  }
}
