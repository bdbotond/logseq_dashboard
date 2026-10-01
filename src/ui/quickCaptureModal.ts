import { LogseqService } from '../services/logseqService';
import { TaskStatus } from '../types';

export class QuickCaptureModal {
  private logseqService = LogseqService.getInstance();
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public async open(): Promise<void> {
    const projects = await this.logseqService.getAllProjects();
    const today = new Date().toISOString().slice(0, 10);

    const projectOptions = projects.length > 0
      ? projects.map((p) => `<option value="${p}">${p}</option>`).join('')
      : '<option value="Default Project">Default Project</option>';

    this.container.innerHTML = `
      <div class="ptf-modal-overlay" id="ptf-quick-capture-overlay">
        <div class="ptf-modal-card">
          <div class="ptf-modal-header">
            <h3>⚡ Quick Task Capture</h3>
            <button class="ptf-modal-close" id="ptf-btn-close">&times;</button>
          </div>
          <form id="ptf-quick-capture-form" class="ptf-modal-body">
            <div class="ptf-form-group">
              <label for="ptf-project-select">Project</label>
              <select id="ptf-project-select" class="ptf-select" required>
                ${projectOptions}
                <option value="__NEW__">+ New Project...</option>
              </select>
              <input type="text" id="ptf-new-project-input" class="ptf-input" placeholder="Enter new project name" style="display: none; margin-top: 6px;" />
            </div>

            <div class="ptf-form-group">
              <label for="ptf-task-title">Task Description</label>
              <input type="text" id="ptf-task-title" class="ptf-input" placeholder="e.g. Implement user authentication flow" required autofocus />
            </div>

            <div class="ptf-row-2">
              <div class="ptf-form-group">
                <label for="ptf-task-status">Status</label>
                <select id="ptf-task-status" class="ptf-select">
                  <option value="NEXT" selected>NEXT</option>
                  <option value="TODO">TODO</option>
                  <option value="DOING">DOING</option>
                  <option value="LATER">LATER</option>
                </select>
              </div>

              <div class="ptf-form-group">
                <label for="ptf-task-scheduled">Scheduled Date</label>
                <input type="date" id="ptf-task-scheduled" class="ptf-input" value="${today}" />
              </div>
            </div>

            <div class="ptf-modal-footer">
              <button type="button" class="ptf-btn ptf-btn-secondary" id="ptf-btn-cancel">Cancel</button>
              <button type="submit" class="ptf-btn ptf-btn-primary">Add Task & Log</button>
            </div>
          </form>
        </div>
      </div>
    `;

    // Make iframe visible
    logseq.showMainUI();

    const overlay = document.getElementById('ptf-quick-capture-overlay');
    const closeBtn = document.getElementById('ptf-btn-close');
    const cancelBtn = document.getElementById('ptf-btn-cancel');
    const form = document.getElementById('ptf-quick-capture-form') as HTMLFormElement;
    const projectSelect = document.getElementById('ptf-project-select') as HTMLSelectElement;
    const newProjectInput = document.getElementById('ptf-new-project-input') as HTMLInputElement;
    const titleInput = document.getElementById('ptf-task-title') as HTMLInputElement;

    setTimeout(() => titleInput?.focus(), 50);

    projectSelect?.addEventListener('change', () => {
      if (projectSelect.value === '__NEW__') {
        newProjectInput.style.display = 'block';
        newProjectInput.required = true;
        newProjectInput.focus();
      } else {
        newProjectInput.style.display = 'none';
        newProjectInput.required = false;
      }
    });

    const close = () => {
      this.container.innerHTML = '';
      logseq.hideMainUI();
    };

    closeBtn?.addEventListener('click', close);
    cancelBtn?.addEventListener('click', close);
    overlay?.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    }, { once: true });

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      let projectName = projectSelect.value;
      if (projectName === '__NEW__') {
        projectName = newProjectInput.value.trim();
      }

      const title = titleInput.value.trim();
      const status = (document.getElementById('ptf-task-status') as HTMLSelectElement).value as TaskStatus;
      const scheduled = (document.getElementById('ptf-task-scheduled') as HTMLInputElement).value;

      if (!title || !projectName) return;

      try {
        await this.logseqService.addTaskToProject({
          project: projectName,
          title,
          status,
          scheduled: scheduled || undefined,
        });
        close();
      } catch (err) {
        console.error(err);
      }
    });
  }
}
