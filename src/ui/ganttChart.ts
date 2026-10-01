import * as d3 from 'd3';
import { ProjectTask, TaskStatus } from '../types';
import { LogseqService } from '../services/logseqService';
import { DependencyModal } from './dependencyModal';
import { escapeHtml } from './icons';
import { exportSvgToPng } from './exportUtils';

export interface GanttTaskItem {
  uuid: string;
  title: string;
  project: string;
  pageName?: string;
  status: TaskStatus;
  startDate: Date;
  endDate: Date;
  deadlineDate?: Date | null;
  completedDate?: Date | null;
  dependsOn: string[];
  isDone: boolean;
  isOverdue: boolean;
  isCompletedLate: boolean;
  daysLate: number;
  priority?: string;
  depth?: number;
}

export class GanttChart {
  private logseqService = LogseqService.getInstance();
  private container: HTMLElement;
  private tasks: ProjectTask[] = [];
  private timeScaleMode: 'DAYS' | 'WEEKS' = 'DAYS';
  private customStart: Date | null = null;
  private customEnd: Date | null = null;
  private selectedProject: string = 'ALL';

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public setTasks(tasks: ProjectTask[]): void {
    this.tasks = tasks;
    this.render();
  }

  public setTimeScale(mode: 'DAYS' | 'WEEKS'): void {
    this.timeScaleMode = mode;
    this.render();
  }

  public setInterval(start: Date | null, end: Date | null): void {
    this.customStart = start;
    this.customEnd = end;
    this.render();
  }

  public setProjectFilter(project: string): void {
    this.selectedProject = project;
    this.render();
  }

  public destroy(): void {
    this.container.innerHTML = '';
  }

  private parseDate(val?: any): Date | null {
    if (!val) return null;
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
    const s = String(val).trim();
    if (!s) return null;
    const m = s.match(/^(\d{4})[-_]?(\d{2})[-_]?(\d{2})/);
    if (m) {
      const d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
      return isNaN(d.getTime()) ? null : d;
    }
    if (/^\d{10,13}$/.test(s)) {
      const d = new Date(parseInt(s, 10));
      return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  private formatDate(d: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  public render(): void {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Prepare Gantt task items
      const ganttTasks: GanttTaskItem[] = [];
      for (const t of this.tasks) {
        const isDone = t.status === 'DONE';
        const deadlineDate = this.parseDate(t.deadline);
        const completedDate = this.parseDate(t.completedAt);
        const scheduledDate = this.parseDate(t.scheduled);
        const createdDate = this.parseDate(t.createdAt);

        let start: Date | null = null;
        let end: Date | null = null;

        if (isDone) {
          if (scheduledDate) {
            start = scheduledDate;
            end = completedDate || deadlineDate || new Date(start);
            if (end.getTime() <= start.getTime()) {
              end = new Date(start);
              end.setDate(end.getDate() + 1);
            }
          } else if (completedDate) {
            end = completedDate;
            if (createdDate && createdDate.getTime() < completedDate.getTime()) {
              start = createdDate;
            } else {
              start = new Date(completedDate);
              start.setDate(start.getDate() - 1);
            }
          } else if (createdDate) {
            start = createdDate;
            end = deadlineDate || new Date(start);
            if (end.getTime() <= start.getTime()) {
              end = new Date(start);
              end.setDate(end.getDate() + 1);
            }
          } else if (deadlineDate) {
            end = deadlineDate;
            start = new Date(deadlineDate);
            start.setDate(start.getDate() - 1);
          } else {
            // Task has no date at all, cannot place on timeline
            continue;
          }
        } else {
          // Active task (TODO, DOING, NOW, WAITING, LATER)
          start = scheduledDate || createdDate;
          if (!start) {
            start = new Date(today);
          }

          end = deadlineDate;
          if (!end) {
            end = new Date(start);
            end.setDate(end.getDate() + 7);
          } else if (end.getTime() <= start.getTime()) {
            end = new Date(start);
            end.setDate(end.getDate() + 1);
          }
        }

        let isOverdue = false;
        let isCompletedLate = false;
        let daysLate = 0;

        if (deadlineDate) {
          const deadlineEnd = new Date(deadlineDate);
          deadlineEnd.setHours(23, 59, 59, 999);

          if (!isDone && t.status !== 'CANCELLED') {
            if (today > deadlineEnd) {
              isOverdue = true;
              daysLate = Math.max(1, Math.ceil((today.getTime() - deadlineEnd.getTime()) / (1000 * 3600 * 24)));
            }
          } else if (isDone && completedDate) {
            const compTime = new Date(completedDate);
            compTime.setHours(23, 59, 59, 999);
            if (compTime > deadlineEnd) {
              isCompletedLate = true;
              daysLate = Math.max(1, Math.ceil((compTime.getTime() - deadlineEnd.getTime()) / (1000 * 3600 * 24)));
            }
          }
        } else if (!isDone && t.status !== 'CANCELLED' && t.scheduled) {
          const schedEnd = new Date(end);
          schedEnd.setHours(23, 59, 59, 999);
          if (today > schedEnd) {
            isOverdue = true;
            daysLate = Math.max(1, Math.ceil((today.getTime() - schedEnd.getTime()) / (1000 * 3600 * 24)));
          }
        }

        ganttTasks.push({
          uuid: t.uuid || `task-${Math.random().toString(36).substring(2, 9)}`,
          title: t.title || 'Untitled Task',
          project: t.project || 'General',
          pageName: t.pageName,
          status: t.status,
          startDate: start,
          endDate: end,
          deadlineDate,
          completedDate,
          dependsOn: Array.isArray(t.dependsOn) ? t.dependsOn : [],
          isDone,
          isOverdue,
          isCompletedLate,
          daysLate,
          priority: t.priority,
        });
      }

      if (ganttTasks.length === 0) {
        this.container.innerHTML = `
          <div class="ptf-gantt-empty">
            <p>No tasks available for Gantt schedule.</p>
          </div>
        `;
        return;
      }

      // Extract all available projects
      const projectSet = new Set<string>();
      for (const t of this.tasks) {
        if (t.project && t.project !== 'General') projectSet.add(t.project);
      }
      const allProjects = Array.from(projectSet).sort();
      if (this.tasks.some((t) => t.project === 'General')) {
        allProjects.push('General');
      }

      // Filter tasks by selected project
      const projectGanttTasks = this.selectedProject === 'ALL'
        ? ganttTasks
        : ganttTasks.filter((t) => t.project === this.selectedProject);

      // Determine min and max dates across tasks
      const dateSource = projectGanttTasks.length > 0 ? projectGanttTasks : ganttTasks;
      let minDate = d3.min(dateSource, (d) => d.startDate);
      let maxDate = d3.max(dateSource, (d) => d.endDate);
      if (!minDate || isNaN(minDate.getTime())) minDate = new Date(today);
      if (!maxDate || isNaN(maxDate.getTime())) maxDate = new Date(today);

      let startRange: Date;
      let endRange: Date;

      if (this.customStart && this.customEnd) {
        startRange = new Date(this.customStart);
        endRange = new Date(this.customEnd);
      } else {
        // Natural range with padding: 2 days before min, 5 days after max
        startRange = new Date(minDate);
        startRange.setDate(startRange.getDate() - 2);
        endRange = new Date(maxDate);
        endRange.setDate(endRange.getDate() + 5);
        if (Math.ceil((endRange.getTime() - startRange.getTime()) / (1000 * 3600 * 24)) < 14) {
          endRange.setDate(startRange.getDate() + 14);
        }
      }

      startRange.setHours(0, 0, 0, 0);
      endRange.setHours(23, 59, 59, 999);

      if (endRange.getTime() <= startRange.getTime()) {
        endRange = new Date(startRange);
        endRange.setDate(endRange.getDate() + 7);
        endRange.setHours(23, 59, 59, 999);
      }

      // Filter tasks overlapping the selected interval
      const displayTasks = projectGanttTasks.filter(
        (t) => t.startDate <= endRange && t.endDate >= startRange
      );

      // Group tasks by project
      const projectGroups = new Map<string, GanttTaskItem[]>();
      for (const gt of displayTasks) {
        if (!projectGroups.has(gt.project)) {
          projectGroups.set(gt.project, []);
        }
        projectGroups.get(gt.project)!.push(gt);
      }

      const projects = Array.from(projectGroups.keys()).sort((a, b) => {
        if (a === 'General') return 1;
        if (b === 'General') return -1;
        return a.localeCompare(b);
      });

      const containerWidth = this.container.getBoundingClientRect().width || this.container.clientWidth || 920;
      const labelWidth = 215;
      const chartMargin = { top: 58, right: 30, bottom: 25, left: labelWidth };
      const availableWidth = Math.max(500, Math.floor(containerWidth - chartMargin.left - chartMargin.right - 35));
      const spanDays = Math.max(1, Math.ceil((endRange.getTime() - startRange.getTime()) / (1000 * 3600 * 24)));
      const dayColWidth = this.timeScaleMode === 'DAYS' ? 40 : 18;
      const chartContentWidth = Math.max(availableWidth, spanDays * dayColWidth);
      const totalSvgWidth = chartMargin.left + chartContentWidth + chartMargin.right;

    // Calculate row heights
    const rowHeight = 34;
    const projectHeaderHeight = 28;
    let currentY = chartMargin.top;

    interface LayoutRow {
      type: 'PROJECT' | 'TASK';
      project: string;
      task?: GanttTaskItem;
      y: number;
    }

    const layoutRows: LayoutRow[] = [];

    projects.forEach((proj) => {
      layoutRows.push({
        type: 'PROJECT',
        project: proj,
        y: currentY,
      });
      currentY += projectHeaderHeight;

      const pTasks = projectGroups.get(proj)!;

      // Topological / dependency tree sorting within this project
      const taskMap = new Map<string, GanttTaskItem>();
      const childrenMap = new Map<string, string[]>();
      const inDegree = new Map<string, number>();

      for (const t of pTasks) {
        const u = t.uuid.toLowerCase();
        taskMap.set(u, t);
        childrenMap.set(u, []);
        inDegree.set(u, 0);
      }

      for (const t of pTasks) {
        const childUuid = t.uuid.toLowerCase();
        for (const predRaw of t.dependsOn) {
          const predUuid = String(predRaw).trim().toLowerCase();
          if (taskMap.has(predUuid)) {
            childrenMap.get(predUuid)!.push(childUuid);
            inDegree.set(childUuid, (inDegree.get(childUuid) || 0) + 1);
          }
        }
      }

      // Root tasks: tasks with 0 predecessors within this project (fallback to lowest inDegree if cycles exist)
      let roots = pTasks
        .filter((t) => inDegree.get(t.uuid.toLowerCase()) === 0)
        .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

      if (roots.length === 0 && pTasks.length > 0) {
        const minInDegree = Math.min(...Array.from(inDegree.values()));
        roots = pTasks
          .filter((t) => (inDegree.get(t.uuid.toLowerCase()) || 0) === minInDegree)
          .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
      }

      // Sort children by startDate as well
      for (const [_, childList] of childrenMap) {
        childList.sort((a, b) => {
          const ta = taskMap.get(a);
          const tb = taskMap.get(b);
          if (ta && tb) return ta.startDate.getTime() - tb.startDate.getTime();
          return 0;
        });
      }

      const orderedProjectTasks: { task: GanttTaskItem; depth: number }[] = [];
      const visited = new Set<string>();

      const dfs = (uuid: string, depth: number) => {
        if (visited.has(uuid)) return;
        visited.add(uuid);
        const t = taskMap.get(uuid);
        if (!t) return;
        t.depth = depth;
        orderedProjectTasks.push({ task: t, depth });
        const children = childrenMap.get(uuid) || [];
        for (const childUuid of children) {
          dfs(childUuid, depth + 1);
        }
      };

      for (const root of roots) {
        dfs(root.uuid.toLowerCase(), 0);
      }

      // Fallback for any tasks in cycles or unreached
      for (const t of pTasks) {
        const u = t.uuid.toLowerCase();
        if (!visited.has(u)) {
          dfs(u, 0);
        }
      }

      orderedProjectTasks.forEach(({ task }) => {
        layoutRows.push({
          type: 'TASK',
          project: proj,
          task,
          y: currentY,
        });
        currentY += rowHeight;
      });
    });

    if (displayTasks.length === 0) {
      currentY += 40;
    }

    const minChartHeight = 360;
    const totalHeight = Math.max(minChartHeight, currentY + chartMargin.bottom);
    const chartBottom = Math.max(minChartHeight - chartMargin.bottom, currentY);

    const parentScroll = this.container.closest('#ptf-dashboard-content') as HTMLElement | null;
    const prevParentScrollTop = parentScroll ? parentScroll.scrollTop : 0;

    // Render outer HTML scaffolding
    const uniqueId = `ptf-gantt-${Math.random().toString(36).substring(2, 9)}`;
    this.container.innerHTML = `
      <div class="ptf-gantt-wrapper" id="${uniqueId}-wrap">
        <div class="ptf-gantt-controls">
          <div class="ptf-gantt-nav-bar">
            <select class="ptf-select-xs ptf-gantt-project-select" title="Filter by project" style="padding: 3px 6px; font-size: 11px;">
              <option value="ALL" ${this.selectedProject === 'ALL' ? 'selected' : ''}>All Projects</option>
              ${allProjects.map((p) => `<option value="${escapeHtml(p)}" ${this.selectedProject === p ? 'selected' : ''}>📁 ${escapeHtml(p)}</option>`).join('')}
            </select>
            <div class="ptf-gantt-nav-group">
              <button type="button" class="ptf-btn ptf-btn-sm ptf-gantt-shift-btn" data-shift="-1" title="Slide earlier">◀</button>
              <button type="button" class="ptf-btn ptf-btn-sm ptf-gantt-shift-btn" data-shift="1" title="Slide later">▶</button>
              <input type="date" class="ptf-input-xs ptf-gantt-start-input" value="${this.formatDate(startRange)}" title="Interval start" />
              <span style="font-size: 11px; color: var(--ptf-text-muted);">to</span>
              <input type="date" class="ptf-input-xs ptf-gantt-end-input" value="${this.formatDate(endRange)}" title="Interval end" />
            </div>
            <div class="ptf-pills ptf-gantt-preset-pills">
              <button type="button" class="ptf-pill" data-preset="1W">1W</button>
              <button type="button" class="ptf-pill" data-preset="2W">2W</button>
              <button type="button" class="ptf-pill" data-preset="1M">1M</button>
              <button type="button" class="ptf-pill ${!this.customStart && !this.customEnd ? 'active' : ''}" data-preset="ALL">ALL</button>
            </div>
            <div class="ptf-pills ptf-gantt-scale-pills">
              <button type="button" class="ptf-pill ${this.timeScaleMode === 'DAYS' ? 'active' : ''}" data-scale="DAYS">Days</button>
              <button type="button" class="ptf-pill ${this.timeScaleMode === 'WEEKS' ? 'active' : ''}" data-scale="WEEKS">Weeks</button>
            </div>
            <button type="button" class="ptf-btn ptf-btn-sm ptf-btn-secondary ptf-gantt-export-btn" title="Export Gantt Chart as PNG">📷 PNG</button>
          </div>
          <div class="ptf-gantt-legend">
            <span class="ptf-legend-item"><span class="ptf-legend-dot ptf-legend-todo"></span> TODO</span>
            <span class="ptf-legend-item"><span class="ptf-legend-dot ptf-legend-doing"></span> DOING / NOW</span>
            <span class="ptf-legend-item"><span class="ptf-legend-dot ptf-legend-waiting"></span> WAITING</span>
            <span class="ptf-legend-item"><span class="ptf-legend-dot ptf-legend-done"></span> DONE</span>
            <span class="ptf-legend-item"><span class="ptf-legend-dot ptf-legend-overdue"></span> Overdue</span>
            <span class="ptf-legend-item"><span class="ptf-legend-dot ptf-legend-late"></span> Finished Late</span>
            <span class="ptf-legend-item"><span class="ptf-legend-arrow">↳</span> Dependency</span>
          </div>
        </div>
        <div class="ptf-gantt-scroll-wrap">
          <svg id="${uniqueId}" width="${totalSvgWidth}" height="${totalHeight}" style="display: block;"></svg>
        </div>
        <div id="${uniqueId}-tooltip" class="ptf-gantt-tooltip" style="display: none;"></div>
      </div>
    `;

    // Handle view mode scale pills
    const pills = this.container.querySelectorAll('.ptf-gantt-scale-pills .ptf-pill');
    pills.forEach((p) => {
      p.addEventListener('click', () => {
        const scale = (p as HTMLElement).dataset.scale as 'DAYS' | 'WEEKS';
        if (scale && scale !== this.timeScaleMode) {
          this.setTimeScale(scale);
        }
      });
    });

    // Handle range presets (1W, 2W, 1M, ALL)
    const presetPills = this.container.querySelectorAll('.ptf-gantt-preset-pills .ptf-pill');
    presetPills.forEach((btn) => {
      btn.addEventListener('click', () => {
        const p = (btn as HTMLElement).dataset.preset;
        if (p === 'ALL') {
          this.setInterval(null, null);
        } else if (p === '1W') {
          const s = new Date(today);
          const e = new Date(today);
          e.setDate(e.getDate() + 7);
          this.setInterval(s, e);
        } else if (p === '2W') {
          const s = new Date(today);
          const e = new Date(today);
          e.setDate(e.getDate() + 14);
          this.setInterval(s, e);
        } else if (p === '1M') {
          const s = new Date(today);
          const e = new Date(today);
          e.setDate(e.getDate() + 30);
          this.setInterval(s, e);
        }
      });
    });

    // Handle slide buttons (◀ / ▶)
    const shiftBtns = this.container.querySelectorAll('.ptf-gantt-shift-btn');
    shiftBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const dir = parseInt((btn as HTMLElement).dataset.shift || '0', 10);
        if (!dir) return;
        const shiftDays = dir * spanDays;
        const newStart = new Date(startRange);
        newStart.setDate(newStart.getDate() + shiftDays);
        const newEnd = new Date(endRange);
        newEnd.setDate(newEnd.getDate() + shiftDays);
        this.setInterval(newStart, newEnd);
      });
    });

    // Handle custom date pickers (debounced with blur/Enter commit to allow multi-digit typing)
    const setupDateInput = (input: HTMLInputElement | null, isStart: boolean) => {
      if (!input) return;
      let timer: any = null;

      const apply = () => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        const val = this.parseDate(input.value);
        if (!val || val.getFullYear() < 1970 || val.getFullYear() > 2100) return;
        if (isStart) {
          let curEnd = endRange;
          if (val.getTime() >= curEnd.getTime()) {
            curEnd = new Date(val);
            curEnd.setDate(curEnd.getDate() + 7);
          }
          this.setInterval(val, curEnd);
        } else {
          let curStart = startRange;
          if (val.getTime() <= curStart.getTime()) {
            curStart = new Date(val);
            curStart.setDate(curStart.getDate() - 7);
          }
          this.setInterval(curStart, val);
        }
      };

      input.addEventListener('keydown', (e) => {
        if (timer) clearTimeout(timer);
        if (e.key === 'Enter') {
          e.preventDefault();
          apply();
        } else {
          timer = setTimeout(apply, 800);
        }
      });

      input.addEventListener('input', () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(apply, 800);
      });

      input.addEventListener('change', () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(apply, 800);
      });

      input.addEventListener('blur', () => {
        apply();
      });
    };

    const startInput = this.container.querySelector('.ptf-gantt-start-input') as HTMLInputElement | null;
    const endInput = this.container.querySelector('.ptf-gantt-end-input') as HTMLInputElement | null;
    setupDateInput(startInput, true);
    setupDateInput(endInput, false);

    // Handle project filter selection
    const projSelect = this.container.querySelector('.ptf-gantt-project-select') as HTMLSelectElement | null;
    projSelect?.addEventListener('change', () => {
      this.selectedProject = projSelect.value;
      this.render();
    });

    // Handle export chart as PNG
    const exportBtn = this.container.querySelector('.ptf-gantt-export-btn');
    exportBtn?.addEventListener('click', () => {
      if (svgEl) {
        const projName = this.selectedProject === 'ALL' ? 'all-projects' : this.selectedProject.toLowerCase().replace(/\s+/g, '-');
        exportSvgToPng(svgEl, `gantt-schedule-${projName}.png`);
      }
    });

    // Handle mouse drag-to-slide on scroll wrap
    const scrollWrap = this.container.querySelector('.ptf-gantt-scroll-wrap') as HTMLElement | null;
    if (scrollWrap) {
      let isDown = false;
      let startX = 0;
      let initialScroll = 0;
      let dragged = false;

      scrollWrap.addEventListener('mousedown', (e: MouseEvent) => {
        if ((e.target as HTMLElement).closest('.ptf-gantt-dep-btn, .ptf-gantt-task-label, .ptf-gantt-bar-group, input, button')) {
          return;
        }
        isDown = true;
        dragged = false;
        startX = e.clientX;
        initialScroll = scrollWrap.scrollLeft;
      });

      scrollWrap.addEventListener('mousemove', (e: MouseEvent) => {
        if (!isDown) return;
        const dx = e.clientX - startX;
        if (Math.abs(dx) > 4) {
          dragged = true;
          scrollWrap.style.cursor = 'grabbing';
        }
        if (scrollWrap.scrollWidth > scrollWrap.clientWidth) {
          scrollWrap.scrollLeft = initialScroll - dx;
        }
      });

      const stopDrag = (e: MouseEvent) => {
        if (!isDown) return;
        isDown = false;
        scrollWrap.style.cursor = '';
        if (dragged) {
          const dx = e.clientX - startX;
          const atLeftEdge = initialScroll === 0 && dx > 40;
          const atRightEdge = initialScroll + scrollWrap.clientWidth >= scrollWrap.scrollWidth - 5 && dx < -40;
          const notScrollable = scrollWrap.scrollWidth <= scrollWrap.clientWidth + 10;
          if (notScrollable || atLeftEdge || atRightEdge) {
            const daysShift = Math.round(-dx / dayColWidth);
            if (daysShift !== 0) {
              const newStart = new Date(startRange);
              newStart.setDate(newStart.getDate() + daysShift);
              const newEnd = new Date(endRange);
              newEnd.setDate(newEnd.getDate() + daysShift);
              this.setInterval(newStart, newEnd);
            }
          }
        }
      };

      scrollWrap.addEventListener('mouseup', stopDrag);
      scrollWrap.addEventListener('mouseleave', stopDrag);
    }

    const wrapper = this.container.querySelector('.ptf-gantt-wrapper') as HTMLElement;
    const svgEl = this.container.querySelector('svg') as SVGSVGElement | null;
    const tooltipEl = this.container.querySelector('.ptf-gantt-tooltip') as HTMLElement | null;

    if (!svgEl) {
      console.error('[ProjectTaskFlow] Gantt SVG element not found in container');
      return;
    }

    const svg = d3.select(svgEl);
    const tooltip = d3.select(tooltipEl);

    // Define Arrow Markers (Normal & Highlighted)
    const defs = svg.append('defs');
    defs
      .append('marker')
      .attr('id', `${uniqueId}-arrow`)
      .attr('viewBox', '0 0 10 10')
      .attr('refX', 7)
      .attr('refY', 5)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M 1 2 L 8 5 L 1 8 Z')
      .attr('fill', '#dd6b20');

    defs
      .append('marker')
      .attr('id', `${uniqueId}-arrow-hl`)
      .attr('viewBox', '0 0 10 10')
      .attr('refX', 7)
      .attr('refY', 5)
      .attr('markerWidth', 7)
      .attr('markerHeight', 7)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M 1 2 L 8 5 L 1 8 Z')
      .attr('fill', '#e53e3e');

    // X Scale
    const xScale = d3.scaleTime().domain([startRange, endRange]).range([chartMargin.left, chartMargin.left + chartContentWidth]);

    // X Axis
    const axisGroup = svg.append('g').attr('class', 'ptf-gantt-axis').attr('transform', `translate(0, ${chartMargin.top - 8})`);

    const axis = this.timeScaleMode === 'DAYS'
      ? d3.axisTop(xScale).ticks(d3.timeDay).tickFormat((d) => d3.timeFormat('%a %d')(d as Date))
      : d3.axisTop(xScale).ticks(d3.timeWeek).tickFormat((d) => d3.timeFormat('%b %d')(d as Date));

    axisGroup.call(axis as any);
    axisGroup
      .selectAll('text')
      .style('font-size', '10px')
      .style('font-weight', '500')
      .style('fill', 'var(--ptf-text-muted)')
      .attr('text-anchor', 'start')
      .attr('transform', 'rotate(-28)')
      .attr('x', 0)
      .attr('y', -6)
      .attr('dx', 2)
      .attr('dy', -2);
    axisGroup.selectAll('line').style('stroke', 'var(--ptf-border)');
    axisGroup.select('.domain').style('stroke', 'var(--ptf-border)');

    // Vertical grid lines
    const gridTicks = this.timeScaleMode === 'DAYS' ? xScale.ticks(d3.timeDay) : xScale.ticks(d3.timeWeek);
    const gridGroup = svg.append('g').attr('class', 'ptf-gantt-grid');
    gridGroup
      .selectAll('line')
      .data(gridTicks)
      .enter()
      .append('line')
      .attr('x1', (d) => xScale(d))
      .attr('x2', (d) => xScale(d))
      .attr('y1', chartMargin.top)
      .attr('y2', chartBottom)
      .attr('stroke', 'var(--ptf-border)')
      .attr('stroke-width', 0.5)
      .attr('stroke-dasharray', '2 2')
      .attr('opacity', 0.5);

    // Today indicator line
    if (today >= startRange && today <= endRange) {
      const todayX = xScale(today);
      svg
        .append('line')
        .attr('x1', todayX)
        .attr('x2', todayX)
        .attr('y1', chartMargin.top - 42)
        .attr('y2', chartBottom)
        .attr('stroke', '#e53e3e')
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '3 3');

      svg
        .append('text')
        .attr('x', todayX + 3)
        .attr('y', chartMargin.top - 44)
        .attr('font-size', '10px')
        .attr('font-weight', '700')
        .attr('fill', '#e53e3e')
        .text('Today');
    }

    if (displayTasks.length === 0) {
      svg
        .append('text')
        .attr('x', chartMargin.left + chartContentWidth / 2)
        .attr('y', chartMargin.top + 50)
        .attr('text-anchor', 'middle')
        .attr('font-size', '13px')
        .attr('font-weight', '500')
        .attr('fill', 'var(--ptf-text-muted)')
        .text('No tasks scheduled in this date interval.');
    }

    // Map task UUID to geometry for dependency lines
    const taskGeo = new Map<string, { x1: number; x2: number; y: number; task: GanttTaskItem }>();

    // Render Rows (Project headers and task bars)
    layoutRows.forEach((row) => {
      if (row.type === 'PROJECT') {
        // Project section background & label
        svg
          .append('rect')
          .attr('x', 0)
          .attr('y', row.y)
          .attr('width', totalSvgWidth)
          .attr('height', projectHeaderHeight)
          .attr('fill', 'var(--ptf-bg-secondary)')
          .attr('opacity', 0.85);

        svg
          .append('text')
          .attr('x', 14)
          .attr('y', row.y + 18)
          .attr('font-size', '12px')
          .attr('font-weight', '700')
          .attr('fill', 'var(--ptf-primary)')
          .text(`📁 ${row.project}`);
      } else if (row.type === 'TASK' && row.task) {
        const t = row.task;
        const taskY = row.y + 6;
        const barHeight = 22;

        const rawX1 = xScale(t.startDate);
        const x1 = isNaN(rawX1) ? chartMargin.left : Math.max(chartMargin.left, rawX1);
        const rawX2 = xScale(t.endDate);
        const maxX = chartMargin.left + chartContentWidth;
        const x2 = isNaN(rawX2) ? x1 + 30 : Math.min(maxX, Math.max(x1 + 18, rawX2));
        const barWidth = Math.max(18, x2 - x1);
        const cleanTitle = t.title || 'Untitled Task';

        taskGeo.set(t.uuid.toLowerCase(), { x1, x2, y: taskY + barHeight / 2, task: t });

        // Zebra background row
        svg
          .append('rect')
          .attr('x', 0)
          .attr('y', row.y)
          .attr('width', totalSvgWidth)
          .attr('height', rowHeight)
          .attr('fill', 'transparent')
          .attr('class', 'ptf-gantt-row-bg');

        // Task label on left
        const labelG = svg
          .append('g')
          .attr('class', 'ptf-gantt-task-label')
          .style('cursor', 'pointer')
          .on('click', () => {
            this.logseqService.jumpToBlock({
              uuid: t.uuid,
              project: t.project,
              pageName: t.pageName,
            });
            logseq.hideMainUI();
          });

        const depBtn = labelG
          .append('text')
          .attr('x', 6)
          .attr('y', taskY + 15)
          .attr('font-size', '11px')
          .attr('class', 'ptf-gantt-dep-btn')
          .style('cursor', 'pointer')
          .text('🔗');

        depBtn.append('title').text('Edit dependencies');

        depBtn.on('click', async (event: MouseEvent) => {
          event.stopPropagation();
          const originalTask: ProjectTask = this.tasks.find((orig) => orig.uuid === t.uuid) || {
            uuid: t.uuid,
            content: cleanTitle,
            title: cleanTitle,
            project: t.project,
            pageName: t.pageName,
            status: t.status,
            dependsOn: t.dependsOn,
          };
          await DependencyModal.getInstance().open(originalTask);
        });

        const depth = t.depth || 0;
        const indentX = 24 + Math.min(depth, 3) * 14;

        if (depth > 0) {
          labelG
            .append('text')
            .attr('x', indentX - 11)
            .attr('y', taskY + 15)
            .attr('font-size', '11px')
            .attr('font-weight', '700')
            .attr('fill', 'var(--ptf-warning, #dd6b20)')
            .text('↳');
        }

        const maxLabelChars = Math.max(10, Math.floor((labelWidth - indentX - 30) / 7));
        const truncatedTitle = cleanTitle.length > maxLabelChars ? cleanTitle.substring(0, maxLabelChars - 1) + '…' : cleanTitle;

        labelG
          .append('text')
          .attr('x', indentX)
          .attr('y', taskY + 15)
          .attr('font-size', '12px')
          .attr('font-weight', depth > 0 ? '400' : '500')
          .attr('fill', t.isDone ? 'var(--ptf-text-muted)' : 'var(--ptf-text)')
          .text(truncatedTitle);

        if (t.isOverdue) {
          labelG
            .append('text')
            .attr('x', labelWidth - 10)
            .attr('y', taskY + 15)
            .attr('font-size', '11px')
            .attr('text-anchor', 'end')
            .attr('fill', '#e53e3e')
            .text('⚠️');
        } else if (t.isCompletedLate) {
          labelG
            .append('text')
            .attr('x', labelWidth - 10)
            .attr('y', taskY + 15)
            .attr('font-size', '10px')
            .attr('text-anchor', 'end')
            .attr('fill', '#dd6b20')
            .text('⌛');
        }

        // Status & Late color classes
        const statusClass = t.isDone
          ? 'ptf-gantt-bar-done'
          : t.status === 'DOING' || t.status === 'NOW'
          ? 'ptf-gantt-bar-doing'
          : t.status === 'WAITING' || t.status === 'LATER'
          ? 'ptf-gantt-bar-waiting'
          : 'ptf-gantt-bar-todo';

        const lateClass = t.isOverdue ? 'ptf-gantt-bar-overdue' : t.isCompletedLate ? 'ptf-gantt-bar-late' : '';

        // Exact presentation colors for self-contained SVG / image export
        const barFill = t.isDone
          ? '#38a169'
          : t.status === 'DOING' || t.status === 'NOW'
          ? '#dd6b20'
          : t.status === 'WAITING' || t.status === 'LATER'
          ? '#805ad5'
          : '#3182ce';
        const barOpacity = t.isDone ? 0.7 : 1.0;
        const barStroke = t.isOverdue ? '#e53e3e' : t.isCompletedLate ? '#dd6b20' : 'none';
        const barStrokeWidth = t.isOverdue || t.isCompletedLate ? 2 : 0;
        const barStrokeDash = t.isOverdue ? '4 2' : t.isCompletedLate ? '3 2' : 'none';

        // Task Bar
        const barG = svg
          .append('g')
          .attr('class', `ptf-gantt-bar-group ${statusClass} ${lateClass}`)
          .attr('data-uuid', t.uuid)
          .style('cursor', 'pointer');

        barG
          .append('rect')
          .attr('class', 'ptf-gantt-bar')
          .attr('x', x1)
          .attr('y', taskY)
          .attr('width', barWidth)
          .attr('height', barHeight)
          .attr('rx', 4)
          .attr('ry', 4)
          .attr('fill', barFill)
          .attr('fill-opacity', barOpacity)
          .attr('stroke', barStroke)
          .attr('stroke-width', barStrokeWidth)
          .attr('stroke-dasharray', barStrokeDash);

        // If overdue and has deadlineDate, draw red dashed deadline marker tick
        if (t.isOverdue && t.deadlineDate) {
          const dX = xScale(t.deadlineDate);
          if (dX >= chartMargin.left && dX <= chartMargin.left + chartContentWidth) {
            barG
              .append('line')
              .attr('x1', dX)
              .attr('x2', dX)
              .attr('y1', taskY - 3)
              .attr('y2', taskY + barHeight + 3)
              .attr('stroke', '#e53e3e')
              .attr('stroke-width', 2)
              .attr('stroke-dasharray', '2 1');
          }
        }

        // Bar inner text or tail text
        if (barWidth >= 55) {
          barG
            .append('text')
            .attr('x', x1 + 6)
            .attr('y', taskY + 15)
            .attr('font-size', '11px')
            .attr('font-weight', '600')
            .attr('fill', '#ffffff')
            .text(cleanTitle.length > Math.floor(barWidth / 8) ? cleanTitle.substring(0, Math.floor(barWidth / 8) - 1) + '…' : cleanTitle);

          if (t.isOverdue) {
            barG
              .append('text')
              .attr('x', x2 + 6)
              .attr('y', taskY + 15)
              .attr('font-size', '10px')
              .attr('font-weight', '700')
              .attr('fill', '#e53e3e')
              .text(`⚠️ ${t.daysLate}d late`);
          } else if (t.isCompletedLate) {
            barG
              .append('text')
              .attr('x', x2 + 6)
              .attr('y', taskY + 15)
              .attr('font-size', '10px')
              .attr('font-weight', '600')
              .attr('fill', '#dd6b20')
              .text(`⌛ +${t.daysLate}d`);
          }
        } else {
          let tailText = cleanTitle.length > 15 ? cleanTitle.substring(0, 13) + '…' : cleanTitle;
          if (t.isOverdue) {
            tailText += ` (⚠️ ${t.daysLate}d late)`;
          } else if (t.isCompletedLate) {
            tailText += ` (⌛ +${t.daysLate}d)`;
          }
          barG
            .append('text')
            .attr('x', x2 + 6)
            .attr('y', taskY + 15)
            .attr('font-size', '11px')
            .attr('font-weight', t.isOverdue ? '700' : '500')
            .attr('fill', t.isOverdue ? '#e53e3e' : 'var(--ptf-text-muted)')
            .text(tailText);
        }

        // Hover & click interactions
        barG
          .on('mouseover', (event: MouseEvent) => {
            const predNames = t.dependsOn
              .map((u) => {
                const pUuid = String(u).trim().toLowerCase();
                const local = taskGeo.get(pUuid)?.task;
                if (local) return local.title;
                const ext = ganttTasks.find((gt) => gt.uuid.toLowerCase() === pUuid);
                return ext ? `[[${ext.project}]] ${ext.title}` : null;
              })
              .filter(Boolean)
              .join(', ');

            const succNames = ganttTasks
              .filter((gt) => gt.dependsOn.some((d) => String(d).trim().toLowerCase() === t.uuid.toLowerCase()))
              .map((gt) => (gt.project !== t.project ? `[[${gt.project}]] ${gt.title}` : gt.title))
              .join(', ');

            let lateBanner = '';
            if (t.isOverdue) {
              lateBanner = `
                <div class="ptf-tooltip-alert ptf-tooltip-alert-danger">
                  ⚠️ <strong>OVERDUE:</strong> Missed deadline by ${t.daysLate} day${t.daysLate > 1 ? 's' : ''}
                </div>
              `;
            } else if (t.isCompletedLate) {
              lateBanner = `
                <div class="ptf-tooltip-alert ptf-tooltip-alert-warning">
                  ⚠️ <strong>COMPLETED LATE:</strong> Finished ${t.daysLate} day${t.daysLate > 1 ? 's' : ''} after deadline
                </div>
              `;
            }

            tooltip.html(`
              <div class="ptf-tooltip-title"><strong>${escapeHtml(cleanTitle)}</strong></div>
              <div class="ptf-tooltip-meta">Project: <span>[[${escapeHtml(t.project)}]]</span></div>
              <div class="ptf-tooltip-meta">Status: <span>${escapeHtml(t.status)}</span></div>
              <div class="ptf-tooltip-meta">Start: <span>${this.formatDate(t.startDate)}</span></div>
              <div class="ptf-tooltip-meta">${t.isDone ? 'Completed' : 'Deadline'}: <span>${this.formatDate(t.endDate)}</span></div>
              ${lateBanner}
              ${predNames ? `<div class="ptf-tooltip-meta" style="margin-top: 4px;">Depends on: <span style="color: var(--ptf-warning);">${escapeHtml(predNames)}</span></div>` : ''}
              ${succNames ? `<div class="ptf-tooltip-meta">Blocking: <span style="color: var(--ptf-primary);">${escapeHtml(succNames)}</span></div>` : ''}
              <div class="ptf-tooltip-meta" style="margin-top: 6px; font-size: 10px; color: var(--ptf-text-muted); border-top: 1px dashed var(--ptf-border); padding-top: 4px;">💡 Click 🔗 on task label to edit dependencies</div>
            `);
            tooltip.style('display', 'block');

            // Highlight connected arrows and anchor dots safely via data attributes
            const targetUuid = t.uuid.toLowerCase();
            svg.selectAll('.ptf-dep-arrow').each(function () {
              const el = this as SVGPathElement;
              const from = el.getAttribute('data-from');
              const to = el.getAttribute('data-to');
              const isMatch = from === targetUuid || to === targetUuid;
              if (isMatch) {
                el.classList.add('highlighted');
                el.classList.remove('dimmed');
                el.setAttribute('marker-end', `url(#${uniqueId}-arrow-hl)`);
              } else {
                el.classList.remove('highlighted');
                el.classList.add('dimmed');
                el.setAttribute('marker-end', `url(#${uniqueId}-arrow)`);
              }
            });
            svg.selectAll('.ptf-dep-dot').each(function () {
              const el = this as SVGCircleElement;
              const from = el.getAttribute('data-from');
              const to = el.getAttribute('data-to');
              const isMatch = from === targetUuid || to === targetUuid;
              if (isMatch) {
                el.classList.add('highlighted');
                el.classList.remove('dimmed');
              } else {
                el.classList.remove('highlighted');
                el.classList.add('dimmed');
              }
            });
          })
          .on('mousemove', (event: MouseEvent) => {
            if (wrapper) {
              const rect = wrapper.getBoundingClientRect();
              const mouseX = event.clientX - rect.left;
              const mouseY = event.clientY - rect.top;
              tooltip.style('left', `${mouseX + 16}px`).style('top', `${mouseY + 10}px`);
            }
          })
          .on('mouseout', () => {
            tooltip.style('display', 'none');
            svg.selectAll('.ptf-dep-arrow').each(function () {
              const el = this as SVGPathElement;
              el.classList.remove('highlighted');
              el.classList.remove('dimmed');
              el.setAttribute('marker-end', `url(#${uniqueId}-arrow)`);
            });
            svg.selectAll('.ptf-dep-dot').each(function () {
              const el = this as SVGCircleElement;
              el.classList.remove('highlighted');
              el.classList.remove('dimmed');
            });
          })
          .on('click', () => {
            this.logseqService.jumpToBlock({
              uuid: t.uuid,
              project: t.project,
              pageName: t.pageName,
            });
            logseq.hideMainUI();
          });
      }
    });

    // Render Dependency Curved Connector Arrows
    const depGroup = svg.append('g').attr('class', 'ptf-gantt-deps');

    displayTasks.forEach((succTask) => {
      const succGeo = taskGeo.get(succTask.uuid.toLowerCase());
      if (!succGeo || succTask.dependsOn.length === 0) return;

      succTask.dependsOn.forEach((rawPredUuid) => {
        const predUuid = String(rawPredUuid).trim().toLowerCase();
        const predGeo = taskGeo.get(predUuid);
        if (!predGeo) return;

        const x1 = predGeo.x2;
        const y1 = predGeo.y;
        const x2 = succGeo.x1;
        const y2 = succGeo.y;

        let pathStr = '';
        if (x2 >= x1 + 14) {
          // Standard forward curve: smooth S-curve
          const dx = Math.max(14, (x2 - x1) * 0.45);
          pathStr = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
        } else {
          // Backward / loopback elbow routing with smooth rounded corners
          const leadOut = 14;
          const leadIn = 14;
          const r = 5;
          const goingDown = y2 >= y1;
          const dirY = goingDown ? 1 : -1;
          const midY = (y1 + y2) / 2;

          pathStr = `M ${x1} ${y1} ` +
            `H ${x1 + leadOut - r} ` +
            `Q ${x1 + leadOut} ${y1} ${x1 + leadOut} ${y1 + r * dirY} ` +
            `V ${midY - r * dirY} ` +
            `Q ${x1 + leadOut} ${midY} ${x1 + leadOut - r} ${midY} ` +
            `H ${x2 - leadIn + r} ` +
            `Q ${x2 - leadIn} ${midY} ${x2 - leadIn} ${midY + r * dirY} ` +
            `V ${y2 - r * dirY} ` +
            `Q ${x2 - leadIn} ${y2} ${x2 - leadIn + r} ${y2} ` +
            `H ${x2}`;
        }

        // Anchor exit circle on predecessor bar
        depGroup
          .append('circle')
          .attr('cx', x1)
          .attr('cy', y1)
          .attr('r', 2.5)
          .attr('class', 'ptf-dep-dot')
          .attr('data-from', predUuid)
          .attr('data-to', succTask.uuid.toLowerCase())
          .attr('fill', '#dd6b20');

        // Connection arrow path
        depGroup
          .append('path')
          .attr('d', pathStr)
          .attr('class', 'ptf-dep-arrow')
          .attr('fill', 'none')
          .attr('stroke', '#dd6b20')
          .attr('stroke-width', 1.8)
          .attr('stroke-opacity', 0.85)
          .attr('data-from', predUuid)
          .attr('data-to', succTask.uuid.toLowerCase())
          .attr('marker-end', `url(#${uniqueId}-arrow)`);
      });
    });

    if (parentScroll) {
      parentScroll.scrollTop = prevParentScrollTop;
    }
    } catch (err) {
      console.error('[ProjectTaskFlow] Error rendering Gantt chart:', err);
      this.container.innerHTML = `
        <div class="ptf-gantt-empty">
          <p style="color: var(--ptf-warning, #dd6b20);">Failed to render Gantt schedule.</p>
        </div>
      `;
    }
  }
}
