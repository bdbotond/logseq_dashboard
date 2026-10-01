import { DashboardRenderer } from './dashboardRenderer';
import { LogseqService } from '../services/logseqService';
import { TaskDependency, TaskStatus } from '../types';
import { ICONS } from './icons';

export class QuickCaptureModal {
  private logseqService = LogseqService.getInstance();
  private container: HTMLElement;
  private selectedIndex = -1;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public async open(): Promise<void> {
    const [projects, allTasks] = await Promise.all([
      this.logseqService.getAllProjects(),
      this.logseqService.fetchTasksForDashboard(),
    ]);

    // Default scheduled date to one week forward
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    const pad = (n: number) => n.toString().padStart(2, '0');
    const defaultScheduled = `${nextWeek.getFullYear()}-${pad(nextWeek.getMonth() + 1)}-${pad(nextWeek.getDate())}`;

    const defaultProject = projects.length > 0 ? projects[0] : '';

    this.container.innerHTML = `
      <div class="ptf-modal-overlay" id="ptf-quick-capture-overlay">
        <div class="ptf-modal-card ptf-modal-card-lg">
          <div class="ptf-modal-header">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="ptf-header-icon" style="color: var(--ptf-primary);">${ICONS.plus}</span>
              <h3>Quick Task Capture</h3>
            </div>
            <button class="ptf-modal-close" id="ptf-btn-close" title="Close">&times;</button>
          </div>
          <form id="ptf-quick-capture-form" class="ptf-modal-body">
            <!-- Project Searchable Combobox -->
            <div class="ptf-form-group">
              <label for="ptf-project-input">Project</label>
              <div class="ptf-combobox-wrap">
                <input
                  type="text"
                  id="ptf-project-input"
                  class="ptf-input"
                  placeholder="Select existing or type new project name..."
                  value="${defaultProject}"
                  autocomplete="off"
                  required
                />
                <div id="ptf-project-list" class="ptf-combobox-list"></div>
              </div>
            </div>

            <!-- Task Description -->
            <div class="ptf-form-group">
              <label for="ptf-task-title">Task Description</label>
              <input
                type="text"
                id="ptf-task-title"
                class="ptf-input"
                placeholder="e.g. Implement user authentication flow"
                required
                autofocus
              />
            </div>

            <!-- Dependencies (Depends on) -->
            <div class="ptf-form-group">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <label for="ptf-depends-input">Depends On (Predecessors)</label>
                <span style="font-size: 11px; color: var(--ptf-text-muted);">Gantt dependency links</span>
              </div>
              <div class="ptf-combobox-wrap">
                <div class="ptf-chips-wrap" id="ptf-depends-chips"></div>
                <input
                  type="text"
                  id="ptf-depends-input"
                  class="ptf-input"
                  placeholder="Type to search and link prerequisite tasks..."
                  autocomplete="off"
                />
                <div id="ptf-depends-list" class="ptf-combobox-list"></div>
              </div>
            </div>

            <!-- Blocks / Successors (Past/Retroactive dependencies) -->
            <div class="ptf-form-group">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <label for="ptf-blocks-input">Blocks (Predecessor for)</label>
                <span style="font-size: 11px; color: var(--ptf-text-muted);">Existing tasks that depend on this</span>
              </div>
              <div class="ptf-combobox-wrap">
                <div class="ptf-chips-wrap" id="ptf-blocks-chips"></div>
                <input
                  type="text"
                  id="ptf-blocks-input"
                  class="ptf-input"
                  placeholder="Type to search tasks that must wait for this one..."
                  autocomplete="off"
                />
                <div id="ptf-blocks-list" class="ptf-combobox-list"></div>
              </div>
            </div>

            <!-- Priority / Categories (Expandable) -->
            <div class="ptf-form-group">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <label>Priority / Category</label>
                <span style="font-size: 11px; color: var(--ptf-text-muted);">Expandable tags</span>
              </div>
              <div class="ptf-priority-pills-bar" id="ptf-priority-pills"></div>
            </div>

            <!-- Recurrence Rule -->
            <div class="ptf-form-group">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <label>Recurrence</label>
                <span id="ptf-recur-preview" class="ptf-recur-preview-tag"></span>
              </div>
              <div class="ptf-pills" id="ptf-recur-pills">
                <button type="button" class="ptf-pill active" data-preset="NONE">None</button>
                <button type="button" class="ptf-pill" data-preset="DAILY">Daily</button>
                <button type="button" class="ptf-pill" data-preset="WEEKLY">Weekly</button>
                <button type="button" class="ptf-pill" data-preset="MONTHLY">Monthly</button>
                <button type="button" class="ptf-pill" data-preset="CUSTOM">Custom...</button>
              </div>
              <!-- Collapsible Custom Recurrence Controls -->
              <div id="ptf-recur-custom-wrap" class="ptf-recur-custom-row" style="display: none;">
                <span style="font-size: 12px; color: var(--ptf-text-muted);">Every</span>
                <input type="number" id="ptf-recur-freq" class="ptf-input ptf-input-xs" min="1" max="99" value="1" style="width: 54px;" />
                <select id="ptf-recur-unit" class="ptf-select ptf-select-xs">
                  <option value="d">Day(s)</option>
                  <option value="w" selected>Week(s)</option>
                  <option value="m">Month(s)</option>
                  <option value="y">Year(s)</option>
                </select>
                <span style="font-size: 12px; color: var(--ptf-text-muted); margin-left: 6px;">Based on</span>
                <select id="ptf-recur-mode" class="ptf-select ptf-select-xs">
                  <option value=".+" selected>Completion date (.+)</option>
                  <option value="+">Scheduled date (+)</option>
                </select>
              </div>
            </div>

            <!-- Dates: Scheduled & Deadline (Side by side) -->
            <div class="ptf-row-2">
              <div class="ptf-form-group">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                  <label for="ptf-task-scheduled">Scheduled Date</label>
                  <div class="ptf-pills" id="ptf-sched-pills">
                    <button type="button" class="ptf-pill" data-days="0">Today</button>
                    <button type="button" class="ptf-pill" data-days="3">+3d</button>
                    <button type="button" class="ptf-pill active" data-days="7">+1w</button>
                    <button type="button" class="ptf-pill" data-action="clear">&times;</button>
                  </div>
                </div>
                <input
                  type="date"
                  id="ptf-task-scheduled"
                  class="ptf-input"
                  value="${defaultScheduled}"
                />
              </div>

              <div class="ptf-form-group">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                  <label for="ptf-task-deadline">Due Date (Deadline)</label>
                  <div class="ptf-pills" id="ptf-deadline-pills">
                    <button type="button" class="ptf-pill" data-days="0">Today</button>
                    <button type="button" class="ptf-pill" data-days="7">+1w</button>
                    <button type="button" class="ptf-pill" data-days="14">+2w</button>
                    <button type="button" class="ptf-pill active" data-action="clear">&times;</button>
                  </div>
                </div>
                <input
                  type="date"
                  id="ptf-task-deadline"
                  class="ptf-input"
                  value=""
                />
              </div>
            </div>

            <!-- Status -->
            <div class="ptf-form-group">
              <label for="ptf-task-status">Status</label>
              <select id="ptf-task-status" class="ptf-select">
                <option value="TODO" selected>TODO</option>
                <option value="DOING">DOING</option>
                <option value="NOW">NOW</option>
                <option value="LATER">LATER</option>
                <option value="WAITING">WAITING</option>
              </select>
            </div>

            <div class="ptf-modal-footer">
              <button type="button" class="ptf-btn ptf-btn-secondary" id="ptf-btn-cancel">Cancel</button>
              <button type="submit" class="ptf-btn ptf-btn-primary">Add Task & Sync</button>
            </div>
          </form>
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

    const overlay = document.getElementById('ptf-quick-capture-overlay');
    const closeBtn = document.getElementById('ptf-btn-close');
    const cancelBtn = document.getElementById('ptf-btn-cancel');
    const form = document.getElementById('ptf-quick-capture-form') as HTMLFormElement;
    const projectInput = document.getElementById('ptf-project-input') as HTMLInputElement;
    const projectList = document.getElementById('ptf-project-list') as HTMLElement;
    const titleInput = document.getElementById('ptf-task-title') as HTMLInputElement;

    setTimeout(() => titleInput?.focus(), 60);

    // Render filtered dropdown
    const renderDropdown = (query: string) => {
      const q = query.trim().toLowerCase();
      const filtered = projects.filter((p) => p.toLowerCase().includes(q));
      const hasExactMatch = projects.some((p) => p.toLowerCase() === q);

      let itemsHtml = '';
      filtered.forEach((p, idx) => {
        itemsHtml += `<div class="ptf-combobox-item" data-index="${idx}" data-value="${p}">${p}</div>`;
      });

      if (query.trim() && !hasExactMatch) {
        itemsHtml += `<div class="ptf-combobox-item ptf-combobox-item-new" data-index="${filtered.length}" data-value="${query.trim()}">+ Create new project: "${query.trim()}"</div>`;
      }

      if (itemsHtml) {
        projectList.innerHTML = itemsHtml;
        projectList.classList.add('open');
      } else {
        projectList.innerHTML = '';
        projectList.classList.remove('open');
      }

      this.selectedIndex = -1;
      updateActiveItem();
    };

    const updateActiveItem = () => {
      const items = projectList.querySelectorAll('.ptf-combobox-item');
      items.forEach((item, idx) => {
        if (idx === this.selectedIndex) {
          item.classList.add('active');
          (item as HTMLElement).scrollIntoView({ block: 'nearest' });
        } else {
          item.classList.remove('active');
        }
      });
    };

    projectInput?.addEventListener('focus', () => {
      renderDropdown(projectInput.value);
    });

    projectInput?.addEventListener('input', () => {
      renderDropdown(projectInput.value);
    });

    projectInput?.addEventListener('keydown', (e) => {
      const items = projectList.querySelectorAll('.ptf-combobox-item');
      if (!projectList.classList.contains('open') || items.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.selectedIndex = (this.selectedIndex + 1) % items.length;
        updateActiveItem();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.selectedIndex = (this.selectedIndex - 1 + items.length) % items.length;
        updateActiveItem();
      } else if (e.key === 'Enter' && this.selectedIndex >= 0) {
        e.preventDefault();
        const selected = items[this.selectedIndex] as HTMLElement;
        if (selected) {
          projectInput.value = selected.dataset.value || projectInput.value;
          projectList.classList.remove('open');
          titleInput?.focus();
        }
      } else if (e.key === 'Escape') {
        projectList.classList.remove('open');
      }
    });

    projectList?.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest('.ptf-combobox-item') as HTMLElement;
      if (target && target.dataset.value) {
        projectInput.value = target.dataset.value;
        projectList.classList.remove('open');
        titleInput?.focus();
      }
    });


    // Dependencies handling (Searchable Multi-select)
    const dependsInput = document.getElementById('ptf-depends-input') as HTMLInputElement;
    const dependsList = document.getElementById('ptf-depends-list') as HTMLElement;
    const dependsChips = document.getElementById('ptf-depends-chips') as HTMLElement;
    const selectedDependencies: TaskDependency[] = [];
    let selectedDepIndex = -1;

    // Blocks handling (Searchable Multi-select for successors)
    const blocksInput = document.getElementById('ptf-blocks-input') as HTMLInputElement;
    const blocksList = document.getElementById('ptf-blocks-list') as HTMLElement;
    const blocksChips = document.getElementById('ptf-blocks-chips') as HTMLElement;
    const selectedBlocks: TaskDependency[] = [];
    let selectedBlockIndex = -1;

    const renderDependsChips = () => {
      if (!dependsChips) return;
      if (selectedDependencies.length === 0) {
        dependsChips.innerHTML = '';
        dependsChips.style.display = 'none';
        return;
      }
      dependsChips.style.display = 'flex';
      dependsChips.innerHTML = selectedDependencies.map((dep, idx) => `
        <span class="ptf-chip">
          <span class="ptf-chip-text">${dep.title}</span>
          <button type="button" class="ptf-chip-remove" data-idx="${idx}" title="Remove dependency">&times;</button>
        </span>
      `).join('');

      dependsChips.querySelectorAll('.ptf-chip-remove').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const idx = parseInt((btn as HTMLElement).dataset.idx || '0', 10);
          selectedDependencies.splice(idx, 1);
          renderDependsChips();
        });
      });
    };

    const renderDependsDropdown = (query: string) => {
      const q = query.trim().toLowerCase();
      const currentProj = projectInput?.value.trim().toLowerCase() || '';
      const excludedUuids = new Set([
        ...selectedDependencies.map((d) => d.uuid),
        ...selectedBlocks.map((d) => d.uuid),
      ]);

      const available = allTasks.filter((t) => !excludedUuids.has(t.uuid));
      const filtered = available.filter((t) => {
        if (!q) return true;
        return t.title.toLowerCase().includes(q) || t.project.toLowerCase().includes(q);
      });

      filtered.sort((a, b) => {
        const aSameProj = currentProj && a.project.toLowerCase() === currentProj ? 0 : 1;
        const bSameProj = currentProj && b.project.toLowerCase() === currentProj ? 0 : 1;
        if (aSameProj !== bSameProj) return aSameProj - bSameProj;
        return a.title.localeCompare(b.title);
      });

      const topItems = filtered.slice(0, 15);

      if (topItems.length > 0) {
        dependsList.innerHTML = topItems.map((t, idx) => `
          <div class="ptf-combobox-item ptf-dep-item" data-index="${idx}" data-uuid="${t.uuid}" data-title="${t.title.replace(/"/g, '&quot;')}">
            <span style="font-weight: 500;">${t.title}</span>
            <span style="font-size: 11px; color: var(--ptf-text-muted); margin-left: 8px;">[${t.project}]</span>
          </div>
        `).join('');
        dependsList.classList.add('open');
      } else {
        dependsList.innerHTML = '<div class="ptf-combobox-item" style="color: var(--ptf-text-muted); cursor: default;">No matching tasks found</div>';
        dependsList.classList.add('open');
      }

      selectedDepIndex = -1;
      updateActiveDepItem();
    };

    const updateActiveDepItem = () => {
      const items = dependsList.querySelectorAll('.ptf-dep-item');
      items.forEach((item, idx) => {
        if (idx === selectedDepIndex) {
          item.classList.add('active');
          (item as HTMLElement).scrollIntoView({ block: 'nearest' });
        } else {
          item.classList.remove('active');
        }
      });
    };

    dependsInput?.addEventListener('focus', () => {
      renderDependsDropdown(dependsInput.value);
    });

    dependsInput?.addEventListener('input', () => {
      renderDependsDropdown(dependsInput.value);
    });

    dependsInput?.addEventListener('keydown', (e) => {
      const items = dependsList.querySelectorAll('.ptf-dep-item');
      if (!dependsList.classList.contains('open') || items.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedDepIndex = (selectedDepIndex + 1) % items.length;
        updateActiveDepItem();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedDepIndex = (selectedDepIndex - 1 + items.length) % items.length;
        updateActiveDepItem();
      } else if (e.key === 'Enter' && selectedDepIndex >= 0) {
        e.preventDefault();
        const selected = items[selectedDepIndex] as HTMLElement;
        if (selected && selected.dataset.uuid) {
          selectedDependencies.push({
            uuid: selected.dataset.uuid,
            title: selected.dataset.title || 'Task',
          });
          renderDependsChips();
          dependsInput.value = '';
          dependsList.classList.remove('open');
        }
      } else if (e.key === 'Escape') {
        dependsList.classList.remove('open');
      }
    });

    dependsList?.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest('.ptf-dep-item') as HTMLElement;
      if (target && target.dataset.uuid) {
        selectedDependencies.push({
          uuid: target.dataset.uuid,
          title: target.dataset.title || 'Task',
        });
        renderDependsChips();
        dependsInput.value = '';
        dependsList.classList.remove('open');
      }
    });


    // Successor / Blocks Combobox Handlers
    const renderBlocksChips = () => {
      if (!blocksChips) return;
      if (selectedBlocks.length === 0) {
        blocksChips.innerHTML = '';
        blocksChips.style.display = 'none';
        return;
      }
      blocksChips.style.display = 'flex';
      blocksChips.innerHTML = selectedBlocks.map((dep, idx) => `
        <span class="ptf-chip">
          <span class="ptf-chip-text">${dep.title}</span>
          <button type="button" class="ptf-chip-remove" data-idx="${idx}" title="Remove successor">&times;</button>
        </span>
      `).join('');

      blocksChips.querySelectorAll('.ptf-chip-remove').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const idx = parseInt((btn as HTMLElement).dataset.idx || '0', 10);
          selectedBlocks.splice(idx, 1);
          renderBlocksChips();
        });
      });
    };

    const renderBlocksDropdown = (query: string) => {
      const q = query.trim().toLowerCase();
      const currentProj = projectInput?.value.trim().toLowerCase() || '';
      const excludedUuids = new Set([
        ...selectedDependencies.map((d) => d.uuid),
        ...selectedBlocks.map((d) => d.uuid),
      ]);

      const available = allTasks.filter((t) => !excludedUuids.has(t.uuid));
      const filtered = available.filter((t) => {
        if (!q) return true;
        return t.title.toLowerCase().includes(q) || t.project.toLowerCase().includes(q);
      });

      filtered.sort((a, b) => {
        const aSameProj = currentProj && a.project.toLowerCase() === currentProj ? 0 : 1;
        const bSameProj = currentProj && b.project.toLowerCase() === currentProj ? 0 : 1;
        if (aSameProj !== bSameProj) return aSameProj - bSameProj;
        return a.title.localeCompare(b.title);
      });

      const topItems = filtered.slice(0, 15);

      if (topItems.length > 0) {
        blocksList.innerHTML = topItems.map((t, idx) => `
          <div class="ptf-combobox-item ptf-block-item" data-index="${idx}" data-uuid="${t.uuid}" data-title="${t.title.replace(/"/g, '&quot;')}">
            <span style="font-weight: 500;">${t.title}</span>
            <span style="font-size: 11px; color: var(--ptf-text-muted); margin-left: 8px;">[${t.project}]</span>
          </div>
        `).join('');
        blocksList.classList.add('open');
      } else {
        blocksList.innerHTML = '<div class="ptf-combobox-item" style="color: var(--ptf-text-muted); cursor: default;">No matching tasks found</div>';
        blocksList.classList.add('open');
      }

      selectedBlockIndex = -1;
      updateActiveBlockItem();
    };

    const updateActiveBlockItem = () => {
      const items = blocksList.querySelectorAll('.ptf-block-item');
      items.forEach((item, idx) => {
        if (idx === selectedBlockIndex) {
          item.classList.add('active');
          (item as HTMLElement).scrollIntoView({ block: 'nearest' });
        } else {
          item.classList.remove('active');
        }
      });
    };

    blocksInput?.addEventListener('focus', () => {
      renderBlocksDropdown(blocksInput.value);
    });

    blocksInput?.addEventListener('input', () => {
      renderBlocksDropdown(blocksInput.value);
    });

    blocksInput?.addEventListener('keydown', (e) => {
      const items = blocksList.querySelectorAll('.ptf-block-item');
      if (!blocksList.classList.contains('open') || items.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedBlockIndex = (selectedBlockIndex + 1) % items.length;
        updateActiveBlockItem();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedBlockIndex = (selectedBlockIndex - 1 + items.length) % items.length;
        updateActiveBlockItem();
      } else if (e.key === 'Enter' && selectedBlockIndex >= 0) {
        e.preventDefault();
        const selected = items[selectedBlockIndex] as HTMLElement;
        if (selected && selected.dataset.uuid) {
          selectedBlocks.push({
            uuid: selected.dataset.uuid,
            title: selected.dataset.title || 'Task',
          });
          renderBlocksChips();
          blocksInput.value = '';
          blocksList.classList.remove('open');
        }
      } else if (e.key === 'Escape') {
        blocksList.classList.remove('open');
      }
    });

    blocksList?.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest('.ptf-block-item') as HTMLElement;
      if (target && target.dataset.uuid) {
        selectedBlocks.push({
          uuid: target.dataset.uuid,
          title: target.dataset.title || 'Task',
        });
        renderBlocksChips();
        blocksInput.value = '';
        blocksList.classList.remove('open');
      }
    });


    // Priority Category handling (Expandable)
    let selectedPriority: string | null = null;
    let categories = this.logseqService.getPriorityCategories();

    const priorityContainer = document.getElementById('ptf-priority-pills') as HTMLElement;
    const renderPriorityPills = () => {
      if (!priorityContainer) return;
      const isDefault = (cat: string) => ['important', 'normal', 'hobby'].includes(cat.toLowerCase());

      let html = `
        <button type="button" class="ptf-cat-pill ${selectedPriority === null ? 'active' : ''}" data-cat="">None</button>
      `;

      categories.forEach((cat) => {
        const active = selectedPriority?.toLowerCase() === cat.toLowerCase() ? 'active' : '';
        const canDelete = !isDefault(cat);
        const lower = cat.toLowerCase();
        const colorClass = lower === 'important' ? 'ptf-cat-important' : lower === 'normal' ? 'ptf-cat-normal' : lower === 'hobby' ? 'ptf-cat-hobby' : 'ptf-cat-custom';
        html += `
          <div class="ptf-cat-pill-wrap">
            <button type="button" class="ptf-cat-pill ${colorClass} ${active}" data-cat="${cat}">
              #${cat}
            </button>
            ${canDelete ? `<button type="button" class="ptf-cat-delete-btn" data-delete-cat="${cat}" title="Delete category">&times;</button>` : ''}
          </div>
        `;
      });

      html += `
        <button type="button" class="ptf-cat-pill ptf-cat-add-btn" id="ptf-btn-show-add-cat">+ Add</button>
        <div id="ptf-add-cat-inline" class="ptf-add-cat-inline" style="display: none;">
          <input type="text" id="ptf-new-cat-input" class="ptf-input ptf-input-xs" placeholder="Category..." maxlength="24" />
          <button type="button" id="ptf-save-new-cat" class="ptf-btn ptf-btn-sm ptf-btn-primary" style="padding: 2px 8px; font-size: 11px;">Save</button>
          <button type="button" id="ptf-cancel-new-cat" class="ptf-btn ptf-btn-sm ptf-btn-secondary" style="padding: 2px 6px; font-size: 11px;">&times;</button>
        </div>
      `;

      priorityContainer.innerHTML = html;

      // Click category pill
      priorityContainer.querySelectorAll('.ptf-cat-pill[data-cat]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const cat = (btn as HTMLElement).dataset.cat;
          selectedPriority = cat ? cat : null;
          renderPriorityPills();
        });
      });

      // Delete custom category
      priorityContainer.querySelectorAll('.ptf-cat-delete-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const toDelete = (btn as HTMLElement).dataset.deleteCat;
          if (toDelete) {
            categories = categories.filter((c) => c.toLowerCase() !== toDelete.toLowerCase());
            this.logseqService.savePriorityCategories(categories);
            if (selectedPriority?.toLowerCase() === toDelete.toLowerCase()) {
              selectedPriority = null;
            }
            renderPriorityPills();
          }
        });
      });

      // Add Category inline toggling
      const showAddBtn = document.getElementById('ptf-btn-show-add-cat');
      const addInline = document.getElementById('ptf-add-cat-inline');
      const newCatInput = document.getElementById('ptf-new-cat-input') as HTMLInputElement;
      const saveNewCat = document.getElementById('ptf-save-new-cat');
      const cancelNewCat = document.getElementById('ptf-cancel-new-cat');

      showAddBtn?.addEventListener('click', () => {
        if (showAddBtn) showAddBtn.style.display = 'none';
        if (addInline) addInline.style.display = 'flex';
        newCatInput?.focus();
      });

      const handleSaveCat = () => {
        const val = newCatInput?.value.trim().replace(/^#+/, '');
        if (val) {
          categories = this.logseqService.addPriorityCategory(val);
          selectedPriority = val;
          renderPriorityPills();
        }
      };

      saveNewCat?.addEventListener('click', handleSaveCat);
      newCatInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleSaveCat();
        } else if (e.key === 'Escape') {
          renderPriorityPills();
        }
      });
      cancelNewCat?.addEventListener('click', () => {
        renderPriorityPills();
      });
    };

    renderPriorityPills();

    // Recurrence logic
    let recurrencePreset: 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'CUSTOM' = 'NONE';
    let repeatFreq = 1;
    let repeatUnit = 'w';
    let repeatMode = '.+';

    const recurPills = document.querySelectorAll('#ptf-recur-pills .ptf-pill');
    const recurCustomWrap = document.getElementById('ptf-recur-custom-wrap') as HTMLElement;
    const recurFreqInput = document.getElementById('ptf-recur-freq') as HTMLInputElement;
    const recurUnitSelect = document.getElementById('ptf-recur-unit') as HTMLSelectElement;
    const recurModeSelect = document.getElementById('ptf-recur-mode') as HTMLSelectElement;
    const recurPreview = document.getElementById('ptf-recur-preview') as HTMLElement;

    const getRepeatingString = (): string | undefined => {
      if (recurrencePreset === 'NONE') return undefined;
      return `${repeatMode}${repeatFreq}${repeatUnit}`;
    };

    const updateRecurrenceUI = () => {
      recurPills.forEach((pill) => {
        const p = (pill as HTMLElement).dataset.preset;
        if (p === recurrencePreset) pill.classList.add('active');
        else pill.classList.remove('active');
      });

      if (recurrencePreset === 'NONE') {
        if (recurCustomWrap) recurCustomWrap.style.display = 'none';
        if (recurPreview) recurPreview.textContent = '';
      } else {
        if (recurCustomWrap) recurCustomWrap.style.display = 'flex';
        if (recurPreview) {
          const rule = getRepeatingString();
          recurPreview.textContent = rule ? `🔁 ${rule}` : '';
        }
      }
    };

    recurPills.forEach((pill) => {
      pill.addEventListener('click', () => {
        const preset = (pill as HTMLElement).dataset.preset as any;
        recurrencePreset = preset;
        if (preset === 'DAILY') {
          repeatFreq = 1;
          repeatUnit = 'd';
          if (recurFreqInput) recurFreqInput.value = '1';
          if (recurUnitSelect) recurUnitSelect.value = 'd';
        } else if (preset === 'WEEKLY') {
          repeatFreq = 1;
          repeatUnit = 'w';
          if (recurFreqInput) recurFreqInput.value = '1';
          if (recurUnitSelect) recurUnitSelect.value = 'w';
        } else if (preset === 'MONTHLY') {
          repeatFreq = 1;
          repeatUnit = 'm';
          if (recurFreqInput) recurFreqInput.value = '1';
          if (recurUnitSelect) recurUnitSelect.value = 'm';
        }
        updateRecurrenceUI();
      });
    });

    recurFreqInput?.addEventListener('input', () => {
      repeatFreq = Math.max(1, parseInt(recurFreqInput.value, 10) || 1);
      recurrencePreset = 'CUSTOM';
      updateRecurrenceUI();
    });

    recurUnitSelect?.addEventListener('change', () => {
      repeatUnit = recurUnitSelect.value;
      recurrencePreset = 'CUSTOM';
      updateRecurrenceUI();
    });

    recurModeSelect?.addEventListener('change', () => {
      repeatMode = recurModeSelect.value;
      updateRecurrenceUI();
    });

    // Date Presets Helpers
    const getOffsetDate = (days: number): string => {
      const d = new Date();
      d.setDate(d.getDate() + days);
      const p = (n: number) => n.toString().padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    };

    // Scheduled Date handler
    const schedInput = document.getElementById('ptf-task-scheduled') as HTMLInputElement;
    const schedPills = document.querySelectorAll('#ptf-sched-pills .ptf-pill');

    schedPills.forEach((pill) => {
      pill.addEventListener('click', () => {
        const action = (pill as HTMLElement).dataset.action;
        if (action === 'clear') {
          if (schedInput) schedInput.value = '';
        } else {
          const days = parseInt((pill as HTMLElement).dataset.days || '0', 10);
          if (schedInput) schedInput.value = getOffsetDate(days);
        }
        schedPills.forEach((p) => p.classList.remove('active'));
        pill.classList.add('active');
      });
    });

    schedInput?.addEventListener('change', () => {
      schedPills.forEach((p) => {
        const action = (p as HTMLElement).dataset.action;
        if (action === 'clear' && !schedInput.value) {
          p.classList.add('active');
        } else if (schedInput.value && (p as HTMLElement).dataset.days && schedInput.value === getOffsetDate(parseInt((p as HTMLElement).dataset.days!, 10))) {
          p.classList.add('active');
        } else {
          p.classList.remove('active');
        }
      });
    });

    // Deadline Date handler
    const deadlineInput = document.getElementById('ptf-task-deadline') as HTMLInputElement;
    const deadlinePills = document.querySelectorAll('#ptf-deadline-pills .ptf-pill');

    deadlinePills.forEach((pill) => {
      pill.addEventListener('click', () => {
        const action = (pill as HTMLElement).dataset.action;
        if (action === 'clear') {
          if (deadlineInput) deadlineInput.value = '';
        } else {
          const days = parseInt((pill as HTMLElement).dataset.days || '0', 10);
          if (deadlineInput) deadlineInput.value = getOffsetDate(days);
        }
        deadlinePills.forEach((p) => p.classList.remove('active'));
        pill.classList.add('active');
      });
    });

    deadlineInput?.addEventListener('change', () => {
      deadlinePills.forEach((p) => {
        const action = (p as HTMLElement).dataset.action;
        if (action === 'clear' && !deadlineInput.value) {
          p.classList.add('active');
        } else if (deadlineInput.value && (p as HTMLElement).dataset.days && deadlineInput.value === getOffsetDate(parseInt((p as HTMLElement).dataset.days!, 10))) {
          p.classList.add('active');
        } else {
          p.classList.remove('active');
        }
      });
    });

    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!projectInput?.contains(target) && !projectList?.contains(target)) {
        projectList?.classList.remove('open');
      }
      if (!dependsInput?.contains(target) && !dependsList?.contains(target)) {
        dependsList?.classList.remove('open');
      }
      if (!blocksInput?.contains(target) && !blocksList?.contains(target)) {
        blocksList?.classList.remove('open');
      }
    };
    document.addEventListener('click', onDocClick);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKeyDown);

    const close = () => {
      document.removeEventListener('click', onDocClick);
      window.removeEventListener('keydown', onKeyDown);
      this.container.innerHTML = '';
      logseq.hideMainUI();
    };

    closeBtn?.addEventListener('click', close);
    cancelBtn?.addEventListener('click', close);
    overlay?.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const projectName = projectInput.value.trim();
      const title = titleInput.value.trim();
      const status = (document.getElementById('ptf-task-status') as HTMLSelectElement).value as TaskStatus;
      const scheduled = (document.getElementById('ptf-task-scheduled') as HTMLInputElement).value;
      const deadline = (document.getElementById('ptf-task-deadline') as HTMLInputElement).value;
      const repeating = getRepeatingString();

      if (!title || !projectName) return;

      try {
        await this.logseqService.addTaskToProject({
          project: projectName,
          title,
          status,
          priority: selectedPriority || undefined,
          scheduled: scheduled || undefined,
          deadline: deadline || undefined,
          repeating,
          dependsOn: selectedDependencies.length > 0 ? selectedDependencies : undefined,
          blocks: selectedBlocks.length > 0 ? selectedBlocks : undefined,
        });
        close();
        await DashboardRenderer.getInstance().refreshAllSlots();
      } catch (err) {
        console.error(err);
      }
    });
  }
}

