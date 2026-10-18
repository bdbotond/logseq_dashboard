import { Transformer } from 'markmap-lib';
import { Markmap } from 'markmap-view';
import { ProjectTask } from '../types';
import { ICONS, escapeHtml } from './icons';
import { exportSvgToPng } from './exportUtils';

export function buildMindmapMarkdown(tasks: ProjectTask[]): string {
  const projectMap = new Map<string, ProjectTask[]>();
  const titleMap = new Map<string, string>();
  const blockingMap = new Map<string, string[]>();

  for (const t of tasks) {
    if (t.uuid) {
      titleMap.set(t.uuid.toLowerCase(), t.title);
    }
  }

  for (const t of tasks) {
    if (Array.isArray(t.dependsOn)) {
      for (const pred of t.dependsOn) {
        const pUuid = String(pred).trim().toLowerCase();
        if (!blockingMap.has(pUuid)) {
          blockingMap.set(pUuid, []);
        }
        blockingMap.get(pUuid)!.push(t.title);
      }
    }
  }

  for (const t of tasks) {
    const proj = t.project && t.project !== 'General' ? t.project : 'General Tasks';
    if (!projectMap.has(proj)) {
      projectMap.set(proj, []);
    }
    projectMap.get(proj)!.push(t);
  }

  if (projectMap.size === 0) {
    return '# Projects & Tasks\n## No Tasks Found\n- Use Quick Task to add project tasks';
  }

  const lines: string[] = ['# Projects Overview'];

  for (const [proj, pTasks] of projectMap.entries()) {
    lines.push(`## ${escapeHtml(proj)}`);

    const activeTasks = pTasks.filter((t) => t.status !== 'DONE' && t.status !== 'CANCELLED');
    const completedTasks = pTasks.filter((t) => t.status === 'DONE');

    // Only add Active branch if active tasks exist
    if (activeTasks.length > 0) {
      lines.push(`### Active Tasks (${activeTasks.length})`);
      for (const t of activeTasks) {
        const prio = t.priority ? ` #${escapeHtml(t.priority)}` : '';
        const rep = t.repeating ? ` 🔁 ${escapeHtml(t.repeating)}` : '';
        const sched = t.scheduled ? ` [Scheduled: ${escapeHtml(t.scheduled)}${rep}]` : '';
        const dead = t.deadline ? ` [Due: ${escapeHtml(t.deadline)}]` : '';

        const dependsOnTitles = (t.dependsOn || [])
          .map((u) => titleMap.get(String(u).trim().toLowerCase()))
          .filter(Boolean) as string[];
        const blocksTitles = blockingMap.get((t.uuid || '').toLowerCase()) || [];

        let depBadge = '';
        if (dependsOnTitles.length > 0) {
          depBadge += ` <span style="color: #dd6b20; font-size: 11px;">[↳ Depends: ${escapeHtml(dependsOnTitles.join(', '))}]</span>`;
        }
        if (blocksTitles.length > 0) {
          depBadge += ` <span style="color: #3182ce; font-size: 11px;">[↳ Blocks: ${escapeHtml(blocksTitles.join(', '))}]</span>`;
        }

        lines.push(`- **${t.status}**: ${escapeHtml(t.title)}${prio}${sched}${dead}${depBadge}`);
      }
    }

    // Only add Completed branch if completed tasks exist (closed/folded by default)
    if (completedTasks.length > 0) {
      lines.push(`### Completed & Past (${completedTasks.length})`);
      for (const t of completedTasks) {
        const prio = t.priority ? ` #${escapeHtml(t.priority)}` : '';
        const finished = t.completedAt ? ` [Completed: ${escapeHtml(t.completedAt)}]` : '';

        const dependsOnTitles = (t.dependsOn || [])
          .map((u) => titleMap.get(String(u).trim().toLowerCase()))
          .filter(Boolean) as string[];
        let depBadge = '';
        if (dependsOnTitles.length > 0) {
          depBadge += ` <span style="color: #dd6b20; font-size: 11px;">[↳ Depended: ${escapeHtml(dependsOnTitles.join(', '))}]</span>`;
        }

        lines.push(`- **DONE**: ${escapeHtml(t.title)}${prio}${finished}${depBadge}`);
      }
    }

    // If neither branch exists
    if (activeTasks.length === 0 && completedTasks.length === 0) {
      lines.push('- *No tasks recorded*');
    }
  }

  return lines.join('\n');
}

export function foldCompletedBranches(node: any): void {
  if (!node) return;
  if (Array.isArray(node.children) && node.children.length > 0 && typeof node.content === 'string') {
    const text = node.content.trim().toLowerCase();
    if (text.startsWith('completed & past')) {
      node.payload = { ...node.payload, fold: 1 };
    }
  }
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      foldCompletedBranches(child);
    }
  }
}

export class MindmapViewer {
  private container: HTMLElement;
  private markmapInstance: Markmap | null = null;
  private transformer = new Transformer();
  private tasks: ProjectTask[] = [];
  private selectedProject: string = 'ALL';
  private resizeObserver: ResizeObserver | null = null;
  private rafId: number | null = null;
  private fitTimer: ReturnType<typeof setTimeout> | null = null;
  private resizeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public setTasks(tasks: ProjectTask[]): void {
    this.tasks = tasks;
    this.render();
  }

  public setProjectFilter(project: string): void {
    this.selectedProject = project;
    this.render();
  }

  private safeFit(): void {
    const svg = this.container.querySelector('.ptf-mindmap-svg') as SVGElement | null;
    if (svg && svg.clientWidth > 0 && svg.clientHeight > 0) {
      try {
        this.markmapInstance?.fit();
      } catch (e) {}
    }
  }

  private cancelPendingTimers(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.fitTimer !== null) {
      clearTimeout(this.fitTimer);
      this.fitTimer = null;
    }
    if (this.resizeTimer !== null) {
      clearTimeout(this.resizeTimer);
      this.resizeTimer = null;
    }
  }

  public render(): void {
    this.cancelPendingTimers();

    if (this.markmapInstance) {
      try {
        this.markmapInstance.destroy();
      } catch (e) {}
      this.markmapInstance = null;
    }

    const projectSet = new Set<string>();
    for (const t of this.tasks) {
      if (t.project && t.project !== 'General') projectSet.add(t.project);
    }
    const projects = Array.from(projectSet).sort();
    if (this.tasks.some((t) => t.project === 'General')) {
      projects.push('General');
    }

    const displayTasks = this.selectedProject === 'ALL'
      ? this.tasks
      : this.tasks.filter((t) => (t.project || 'General') === this.selectedProject);

    this.container.innerHTML = `
      <div class="ptf-mindmap-view">
        <div class="ptf-mindmap-toolbar">
          <div style="display: flex; align-items: center; gap: 6px;">
            <select class="ptf-select-xs ptf-mm-project-select" title="Filter by project" style="padding: 3px 6px; font-size: 11px;">
              <option value="ALL" ${this.selectedProject === 'ALL' ? 'selected' : ''}>All Projects</option>
              ${projects.map((p) => `<option value="${escapeHtml(p)}" ${this.selectedProject === p ? 'selected' : ''}>📁 ${escapeHtml(p)}</option>`).join('')}
            </select>
            <button class="ptf-icon-btn" id="ptf-mm-fit" title="Fit to View">${ICONS.fit} Fit</button>
            <button class="ptf-icon-btn" id="ptf-mm-in" title="Zoom In">${ICONS.zoomIn}</button>
            <button class="ptf-icon-btn" id="ptf-mm-out" title="Zoom Out">${ICONS.zoomOut}</button>
            <button class="ptf-icon-btn" id="ptf-mm-export" title="Export Mindmap as PNG">📷 PNG</button>
          </div>
        </div>
        <svg class="ptf-mindmap-svg"></svg>
      </div>
    `;

    const svg = this.container.querySelector('.ptf-mindmap-svg') as SVGElement;
    if (!svg) return;

    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      try {
        const md = buildMindmapMarkdown(displayTasks);
        const { root } = this.transformer.transform(md);
        foldCompletedBranches(root);

        this.markmapInstance = Markmap.create(
          svg,
          {
            autoFit: true,
            duration: 250,
          },
          root
        );
        this.fitTimer = setTimeout(() => {
          this.fitTimer = null;
          this.safeFit();
        }, 50);

        const projSelect = this.container.querySelector('.ptf-mm-project-select') as HTMLSelectElement | null;
        projSelect?.addEventListener('change', () => {
          this.selectedProject = projSelect.value;
          this.render();
        });

        const btnFit = this.container.querySelector('#ptf-mm-fit');
        const btnIn = this.container.querySelector('#ptf-mm-in');
        const btnOut = this.container.querySelector('#ptf-mm-out');
        const btnExport = this.container.querySelector('#ptf-mm-export');

        btnFit?.addEventListener('click', () => {
          this.safeFit();
        });

        btnIn?.addEventListener('click', () => {
          this.markmapInstance?.rescale(1.25);
        });

        btnOut?.addEventListener('click', () => {
          this.markmapInstance?.rescale(0.8);
        });

        btnExport?.addEventListener('click', () => {
          const name = this.selectedProject === 'ALL' ? 'all-projects' : this.selectedProject.toLowerCase().replace(/\s+/g, '-');
          exportSvgToPng(svg, `mindmap-${name}.png`);
        });

        if (!this.resizeObserver && window.ResizeObserver) {
          this.resizeObserver = new ResizeObserver(() => {
            if (this.resizeTimer) clearTimeout(this.resizeTimer);
            this.resizeTimer = setTimeout(() => {
              this.resizeTimer = null;
              this.safeFit();
            }, 100);
          });
          this.resizeObserver.observe(this.container);
        }
      } catch (err) {
        console.error('[ProjectTaskFlow] Error rendering Markmap:', err);
        this.container.innerHTML = `<div class="ptf-empty-state">Unable to render mindmap: ${escapeHtml(String(err))}</div>`;
      }
    });
  }

  public destroy(): void {
    this.cancelPendingTimers();
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.markmapInstance) {
      try {
        this.markmapInstance.destroy();
      } catch (e) {}
      this.markmapInstance = null;
    }
  }
}
