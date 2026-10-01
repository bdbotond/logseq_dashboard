import { Transformer } from 'markmap-lib';
import { Markmap } from 'markmap-view';
import { ProjectTask } from '../types';

export class MindmapViewer {
  private container: HTMLElement;
  private markmapInstance: Markmap | null = null;
  private transformer = new Transformer();
  private tasks: ProjectTask[] = [];

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public setTasks(tasks: ProjectTask[]): void {
    this.tasks = tasks;
    this.render();
  }

  /**
   * Convert task list into hierarchical Markdown
   */
  private buildMarkdown(): string {
    if (this.tasks.length === 0) {
      return '# Projects & Tasks\n## No Tasks Found\n- Use Quick Capture to add tasks to your projects';
    }

    // Group tasks by project
    const projectMap = new Map<string, ProjectTask[]>();
    for (const t of this.tasks) {
      const proj = t.project || 'General';
      if (!projectMap.has(proj)) {
        projectMap.set(proj, []);
      }
      projectMap.get(proj)!.push(t);
    }

    const lines: string[] = ['# Projects Overview'];

    for (const [proj, pTasks] of projectMap.entries()) {
      lines.push(`## ${proj}`);

      const activeTasks = pTasks.filter((t) => t.status !== 'DONE' && t.status !== 'CANCELLED');
      const completedTasks = pTasks.filter((t) => t.status === 'DONE');

      // What's Next & Active branch
      lines.push(`### 🚀 What's Next & Active (${activeTasks.length})`);
      if (activeTasks.length > 0) {
        for (const t of activeTasks) {
          const sched = t.scheduled ? ` [📅 ${t.scheduled}]` : '';
          lines.push(`- **${t.status}**: ${t.title}${sched}`);
        }
      } else {
        lines.push('- *No active tasks*');
      }

      // Past & Completed branch
      lines.push(`### ✅ Completed & Past (${completedTasks.length})`);
      if (completedTasks.length > 0) {
        for (const t of completedTasks) {
          const finished = t.completedAt ? ` [Finished: ${t.completedAt}]` : '';
          lines.push(`- **DONE**: ${t.title}${finished}`);
        }
      } else {
        lines.push('- *No completed tasks yet*');
      }
    }

    return lines.join('\n');
  }

  public render(): void {
    this.container.innerHTML = `
      <div class="ptf-mindmap-view">
        <div class="ptf-mindmap-toolbar">
          <button class="ptf-icon-btn" id="ptf-mm-fit" title="Fit to View">🎯 Fit</button>
          <button class="ptf-icon-btn" id="ptf-mm-in" title="Zoom In">➕</button>
          <button class="ptf-icon-btn" id="ptf-mm-out" title="Zoom Out">➖</button>
        </div>
        <svg id="ptf-mindmap-svg" class="ptf-mindmap-svg"></svg>
      </div>
    `;

    const svg = this.container.querySelector('#ptf-mindmap-svg') as SVGElement;
    if (!svg) return;

    try {
      const md = this.buildMarkdown();
      const { root } = this.transformer.transform(md);

      if (this.markmapInstance) {
        this.markmapInstance.setData(root);
        this.markmapInstance.fit();
      } else {
        this.markmapInstance = Markmap.create(svg, {
          autoFit: true,
          duration: 300,
        }, root);
      }

      // Toolbar event handlers
      const btnFit = this.container.querySelector('#ptf-mm-fit');
      const btnIn = this.container.querySelector('#ptf-mm-in');
      const btnOut = this.container.querySelector('#ptf-mm-out');

      btnFit?.addEventListener('click', () => {
        this.markmapInstance?.fit();
      });

      btnIn?.addEventListener('click', () => {
        this.markmapInstance?.rescale(1.25);
      });

      btnOut?.addEventListener('click', () => {
        this.markmapInstance?.rescale(0.8);
      });
    } catch (err) {
      console.error('[ProjectTaskFlow] Error rendering Markmap:', err);
      this.container.innerHTML = `<div class="ptf-empty-state">Error rendering mindmap: ${err}</div>`;
    }
  }

  public destroy(): void {
    if (this.markmapInstance) {
      this.markmapInstance.destroy();
      this.markmapInstance = null;
    }
  }
}
