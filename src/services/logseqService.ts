import { CreateTaskParams, ProjectLogEntry, ProjectTask, TaskDependency, TaskStatus } from '../types';

export function cleanTaskTitle(content: string, priorityCategories: string[] = []): string {
  let title = content
    .replace(/^(TODO|DOING|DONE|LATER|NOW|WAITING|CANCELLED|CANCELED)\s+/i, '')
    .replace(/\[#[A-C]\]\s*/i, '')
    .replace(/SCHEDULED:\s*<[^>]+>/gi, '')
    .replace(/DEADLINE:\s*<[^>]+>/gi, '')
    .replace(/CLOSED:\s*[<\[][^>\]]+[>\]]/gi, '')
    .split('\n')[0];

  const allPriorities = ['important', 'normal', 'hobby', ...priorityCategories.map((c) => c.toLowerCase())];
  for (const p of allPriorities) {
    const esc = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    title = title.replace(new RegExp(`(#\\[\\[${esc}\\]\\]|#${esc}\\b)`, 'gi'), '');
  }

  return title.replace(/\[\[([^\]]+)\]\]/g, '$1').trim();
}

export function extractProjectName(block: any, priorityCategories: string[] = [], pageName?: string): string {
  if (block.properties && (block.properties.project || block.properties['project'])) {
    return String(block.properties.project || block.properties['project']).trim();
  }

  const ignoredTags = new Set([
    'todo', 'doing', 'done', 'later', 'now', 'waiting', 'cancelled', 'canceled',
    'a', 'b', 'c', 'priority', 'task', 'tasks', 'important', 'normal', 'hobby',
    ...priorityCategories.map((c) => c.toLowerCase()),
  ]);

  const content = block.content || '';

  const hashRefs = Array.from(content.matchAll(/#\[\[([^\]]+)\]\]/g));
  for (const m of hashRefs as RegExpMatchArray[]) {
    const tag = (m[1] || '').trim();
    if (tag && !ignoredTags.has(tag.toLowerCase())) return tag;
  }

  const hashTags = Array.from(content.matchAll(/#([\w-]+)/g));
  for (const m of hashTags as RegExpMatchArray[]) {
    const tag = (m[1] || '').trim();
    if (tag && !ignoredTags.has(tag.toLowerCase())) return tag;
  }

  const pageRefs = Array.from(content.matchAll(/\[\[([^\]]+)\]\]/g));
  for (const m of pageRefs as RegExpMatchArray[]) {
    const tag = (m[1] || '').trim();
    if (tag && !ignoredTags.has(tag.toLowerCase())) return tag;
  }

  if (block.parent && block.parent.content) {
    const pMatch = block.parent.content.match(/(?:#?\[\[([^\]]+)\]\]|###?\s+([^\n]+)|#([\w-]+))/);
    if (pMatch) {
      const raw = (pMatch[1] || pMatch[2] || pMatch[3] || '').trim();
      if (raw && !raw.toLowerCase().startsWith('project dashboard')) {
        return raw.replace(/^\[\[/, '').replace(/\]\]$/, '').trim();
      }
    }
  }

  if (pageName) {
    const lowerPage = pageName.toLowerCase();
    if (lowerPage !== 'projects & tasks' && !lowerPage.startsWith('contents') && lowerPage !== 'templates') {
      return pageName;
    }
  } else if (block.page) {
    const pObj = block.page;
    const pName = typeof pObj === 'string' ? pObj : (pObj.originalName || pObj['original-name'] || pObj.name);
    if (pName && pName !== 'Projects & Tasks' && !pName.toLowerCase().startsWith('contents')) {
      return pName;
    }
  }

  return 'General';
}

export class LogseqService {
  private static instance: LogseqService;

  public static getInstance(): LogseqService {
    if (!LogseqService.instance) {
      LogseqService.instance = new LogseqService();
    }
    return LogseqService.instance;
  }

  public getTimestamp(): string {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16).replace('T', ' ');
  }

  public async getAllProjects(): Promise<string[]> {
    try {
      // Suggest project names from already tracked tasks first
      const tasks = await this.fetchTasksForDashboard();
      const projectSet = new Set<string>();
      for (const t of tasks) {
        if (t.project && t.project !== 'General') {
          projectSet.add(t.project);
        }
      }

      // Also get user-created pages for autocomplete convenience in quick capture
      const pages = await logseq.Editor.getAllPages();
      if (pages) {
        for (const p of pages) {
          if (!p || !p.originalName) continue;
          if (p['journal?']) continue;
          const name = p.originalName.toLowerCase();
          if (
            name.startsWith('logseq/') ||
            name.startsWith('contents') ||
            name === 'templates' ||
            name === 'projects & tasks' ||
            name === 'general'
          ) {
            continue;
          }
          projectSet.add(p.originalName);
        }
      }

      return Array.from(projectSet).sort((a, b) => a.localeCompare(b));
    } catch (err) {
      console.error('[ProjectTaskFlow] Error fetching projects:', err);
      return [];
    }
  }

  public async createMasterTasksPage(pageName = 'Projects & Tasks'): Promise<string> {
    try {
      let page = await logseq.Editor.getPage(pageName);
      if (!page) {
        page = await logseq.Editor.createPage(
          pageName,
          { description: 'Central Master Task Flow & Projects Overview' },
          { createFirstBlock: false, redirect: true }
        );
      }

      const blocks = await logseq.Editor.getPageBlocksTree(pageName);
      if (!blocks || blocks.length === 0) {
        const headerBlock = await logseq.Editor.appendBlockInPage(
          pageName,
          '# Master Task Management\nCentral workspace for managing all project splits, active milestones, and tasks.'
        );

        if (headerBlock) {
          await logseq.Editor.insertBlock(
            headerBlock.uuid,
            '## Active Projects\nAdd project tasks and splits below:',
            { sibling: true }
          );

          await logseq.Editor.appendBlockInPage(
            pageName,
            '## Project Dashboard & Mindmap\n{{renderer :project-dashboard}}'
          );
        }
      } else {
        const hasRenderer = blocks.some((b: any) => this.contentIncludesRenderer(b));
        if (!hasRenderer) {
          await logseq.Editor.appendBlockInPage(
            pageName,
            '## Project Dashboard & Mindmap\n{{renderer :project-dashboard}}'
          );
        }
      }

      return pageName;
    } catch (err) {
      console.error('[ProjectTaskFlow] Error creating master tasks page:', err);
      throw err;
    }
  }

  private contentIncludesRenderer(block: any): boolean {
    if (block.content && block.content.includes(':project-dashboard')) return true;
    if (block.children && block.children.length > 0) {
      return block.children.some((child: any) => this.contentIncludesRenderer(child));
    }
    return false;
  }

  public async appendProjectLog(projectName: string, entry: ProjectLogEntry): Promise<void> {
    try {
      if (projectName === 'General') return;

      let projectPage = await logseq.Editor.getPage(projectName);
      if (!projectPage) {
        projectPage = await logseq.Editor.createPage(projectName);
      }

      const blocks = await logseq.Editor.getPageBlocksTree(projectName);
      let logSectionBlock = blocks ? blocks.find((b: any) => b.content && b.content.trim().startsWith('## Project Log')) : null;

      if (!logSectionBlock) {
        logSectionBlock = await logseq.Editor.appendBlockInPage(
          projectName,
          '## Project Log\nAutomated audit history of tasks and milestones'
        );
      }

      if (logSectionBlock) {
        const logContent = `- \`${entry.timestamp}\` **[${entry.action}]** ${entry.taskTitle}${entry.details ? ` (${entry.details})` : ''}`;
        await logseq.Editor.insertBlock(logSectionBlock.uuid, logContent, { sibling: false });
      }
    } catch (err) {
      console.error(`[ProjectTaskFlow] Error appending log for project ${projectName}:`, err);
    }
  }

  public getPriorityCategories(): string[] {
    try {
      const stored = localStorage.getItem('ptf_priority_categories');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return ['Important', 'Normal', 'Hobby'];
  }

  public savePriorityCategories(cats: string[]): void {
    try {
      localStorage.setItem('ptf_priority_categories', JSON.stringify(cats));
    } catch {}
  }

  public addPriorityCategory(category: string): string[] {
    const trimmed = category.trim();
    if (!trimmed) return this.getPriorityCategories();
    const cats = this.getPriorityCategories();
    const exists = cats.some((c) => c.toLowerCase() === trimmed.toLowerCase());
    if (!exists) {
      cats.push(trimmed);
      this.savePriorityCategories(cats);
    }
    return cats;
  }

  public async addTaskToProject(params: CreateTaskParams): Promise<void> {
    try {
      // Ensure the project page exists if it is a real project name
      if (params.project && params.project !== 'General') {
        const existingPage = await logseq.Editor.getPage(params.project);
        if (!existingPage) {
          await logseq.Editor.createPage(params.project, {}, { redirect: false });
        }
      }

      const getLogseqDate = (dateStr: string, repeatStr?: string): string => {
        const d = new Date(dateStr + 'T00:00:00');
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const dayStr = !isNaN(d.getTime()) ? ` ${dayNames[d.getDay()]}` : '';
        const rep = repeatStr ? ` ${repeatStr}` : '';
        return `<${dateStr}${dayStr}${rep}>`;
      };

      const scheduledStr = params.scheduled ? `\nSCHEDULED: ${getLogseqDate(params.scheduled, params.repeating)}` : '';
      const deadlineStr = params.deadline ? `\nDEADLINE: ${getLogseqDate(params.deadline, !params.scheduled ? params.repeating : undefined)}` : '';
      const priorityTag = params.priority ? (params.priority.includes(' ') ? ` #[[${params.priority}]]` : ` #${params.priority}`) : '';
      const projectTag = params.project !== 'General' ? ` #[[${params.project}]]` : '';
      const taskLine = `${params.status} ${params.title}${priorityTag}${projectTag}${scheduledStr}${deadlineStr}`;

      const masterPageName = 'Projects & Tasks';
      const masterPage = await logseq.Editor.getPage(masterPageName);

      let insertedUuid = '';
      if (masterPage) {
        const blocks = await logseq.Editor.getPageBlocksTree(masterPageName);
        let projectBlock = blocks && params.project !== 'General' ? this.findBlockWithContent(blocks, `[[${params.project}]]`) : null;
        if (!projectBlock) {
          if (params.project !== 'General') {
            projectBlock = await logseq.Editor.appendBlockInPage(masterPageName, `### [[${params.project}]]`);
          } else {
            projectBlock = await logseq.Editor.appendBlockInPage(masterPageName, `### General Tasks`);
          }
        }

        if (projectBlock) {
          const inserted = await logseq.Editor.insertBlock(projectBlock.uuid, taskLine, { sibling: false });
          if (inserted) {
            insertedUuid = inserted.uuid;
            await logseq.Editor.upsertBlockProperty(inserted.uuid, 'created-at', this.getTimestamp());
            if (params.project !== 'General') {
              await logseq.Editor.upsertBlockProperty(inserted.uuid, 'project', params.project);
            }
            if (params.priority) {
              await logseq.Editor.upsertBlockProperty(inserted.uuid, 'priority', params.priority);
            }
            if (params.dependsOn && params.dependsOn.length > 0) {
              const depVal = params.dependsOn.map((d) => `[${d.title}](((${d.uuid})))`).join(', ');
              await logseq.Editor.upsertBlockProperty(inserted.uuid, 'depends-on', depVal);
            }
          }
        }
      } else {
        const targetPage = params.project !== 'General' ? params.project : 'Projects & Tasks';
        let projectPage = await logseq.Editor.getPage(targetPage);
        if (!projectPage) {
          projectPage = await logseq.Editor.createPage(targetPage);
        }
        const inserted = await logseq.Editor.appendBlockInPage(targetPage, taskLine);
        if (inserted) {
          insertedUuid = inserted.uuid;
          await logseq.Editor.upsertBlockProperty(inserted.uuid, 'created-at', this.getTimestamp());
          if (params.project !== 'General') {
            await logseq.Editor.upsertBlockProperty(inserted.uuid, 'project', params.project);
          }
          if (params.priority) {
            await logseq.Editor.upsertBlockProperty(inserted.uuid, 'priority', params.priority);
          }
          if (params.dependsOn && params.dependsOn.length > 0) {
            const depVal = params.dependsOn.map((d) => `[${d.title}](((${d.uuid})))`).join(', ');
            await logseq.Editor.upsertBlockProperty(inserted.uuid, 'depends-on', depVal);
          }
        }
      }

      // Link new task into successors (tasks that depend on this new task)
      if (insertedUuid && params.blocks && params.blocks.length > 0) {
        for (const succ of params.blocks) {
          await this.addDependencyToTask(succ.uuid, { uuid: insertedUuid, title: params.title });
        }
      }

      // Sync to Daily Journal for Journals Calendar plugin
      if (insertedUuid && (params.scheduled || params.deadline)) {
        await this.syncTaskToJournal(insertedUuid, params.scheduled, params.deadline);
      }

      if (params.project !== 'General') {
        const detailParts: string[] = [`Initial status: ${params.status}`];
        if (params.priority) detailParts.push(`Priority: #${params.priority}`);
        if (params.scheduled) detailParts.push(`Scheduled: ${params.scheduled}`);
        if (params.repeating) detailParts.push(`Repeats: ${params.repeating}`);
        if (params.deadline) detailParts.push(`Deadline: ${params.deadline}`);
        if (params.dependsOn && params.dependsOn.length > 0) {
          detailParts.push(`Depends on: ${params.dependsOn.map((d) => d.title).join(', ')}`);
        }

        await this.appendProjectLog(params.project, {
          timestamp: this.getTimestamp(),
          taskTitle: params.title,
          action: 'ADDED',
          details: detailParts.join(', '),
        });
        logseq.UI.showMsg(`Task added to [[${params.project}]]`, 'success');
      } else {
        logseq.UI.showMsg(`Task added`, 'success');
      }
    } catch (err) {
      console.error('[ProjectTaskFlow] Error adding task:', err);
      logseq.UI.showMsg(`Error adding task: ${err}`, 'error');
      throw err;
    }
  }

  public async addDependencyToTask(taskUuid: string, dep: TaskDependency): Promise<void> {
    const block = await logseq.Editor.getBlock(taskUuid);
    if (!block) return;
    const currentRaw = String(block.properties?.['depends-on'] || block.properties?.dependsOn || '').trim();
    if (currentRaw.includes(dep.uuid)) return;
    const newRef = `[${dep.title}](((${dep.uuid})))`;
    const updatedVal = currentRaw ? `${currentRaw}, ${newRef}` : newRef;
    await logseq.Editor.upsertBlockProperty(taskUuid, 'depends-on', updatedVal);
  }

  public async removeDependencyFromTask(taskUuid: string, predUuid: string): Promise<void> {
    const block = await logseq.Editor.getBlock(taskUuid);
    if (!block) return;
    const currentRaw = String(block.properties?.['depends-on'] || block.properties?.dependsOn || '').trim();
    if (!currentRaw) return;

    const parts = currentRaw.split(/,\s*/);
    const kept = parts.filter((p) => !p.includes(`((${predUuid}))`));
    if (kept.length > 0) {
      await logseq.Editor.upsertBlockProperty(taskUuid, 'depends-on', kept.join(', '));
    } else {
      await logseq.Editor.removeBlockProperty(taskUuid, 'depends-on');
    }
  }

  public async setTaskDependencies(taskUuid: string, deps: TaskDependency[]): Promise<void> {
    if (deps.length > 0) {
      const depVal = deps.map((d) => `[${d.title}](((${d.uuid})))`).join(', ');
      await logseq.Editor.upsertBlockProperty(taskUuid, 'depends-on', depVal);
    } else {
      await logseq.Editor.removeBlockProperty(taskUuid, 'depends-on');
    }
  }

  private findBlockWithContent(blocks: any[], search: string): any | null {
    for (const b of blocks) {
      if (b.content && b.content.includes(search)) return b;
      if (b.children && b.children.length > 0) {
        const found = this.findBlockWithContent(b.children, search);
        if (found) return found;
      }
    }
    return null;
  }

  public async fetchTasksForDashboard(): Promise<ProjectTask[]> {
    try {
      const query = `
        [:find (pull ?b [* {:block/page [:block/original-name :block/name :journal? :page/journal? :page/journal-day :block/journal-day :journal-day]
                            :block/parent [:block/content {:block/page [:block/original-name :block/name :journal? :page/journal? :page/journal-day]}]}])
         :where
         [?b :block/marker ?marker]
         [(contains? #{"TODO" "DOING" "DONE" "LATER" "NOW" "WAITING" "CANCELLED" "CANCELED"} ?marker)]]
      `;

      const results = await logseq.DB.datascriptQuery(query);
      if (!results || !Array.isArray(results)) return [];

      const tasks: ProjectTask[] = [];

      for (const res of results) {
        const block = Array.isArray(res) ? res[0] : res;
        if (!block || !block.content || !block.marker) continue;

        const pageObj = block.page || block['block/page'];
        let pageName = '';
        if (pageObj) {
          if (typeof pageObj === 'string') {
            pageName = pageObj;
          } else if (typeof pageObj === 'object') {
            pageName =
              pageObj['original-name'] ||
              pageObj.originalName ||
              pageObj['block/original-name'] ||
              pageObj.name ||
              pageObj['block/name'] ||
              '';
          }
        }

        const project = extractProjectName(block, this.getPriorityCategories(), pageName);
        const cleanTitle = cleanTaskTitle(block.content);

        let priority: string | undefined;
        if (block.properties && (block.properties.priority || block.properties['priority'])) {
          priority = String(block.properties.priority || block.properties['priority']).trim();
        }
        if (!priority) {
          const allCats = this.getPriorityCategories();
          for (const cat of allCats) {
            const escapedCat = cat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pattern = new RegExp(`(?:#\\[\\[${escapedCat}\\]\\]|#${escapedCat}\\b)`, 'i');
            if (pattern.test(block.content)) {
              priority = cat;
              break;
            }
          }
        }
        if (!priority) {
          const orgPriorityMatch = block.content.match(/\[#([A-C])\]/i);
          if (orgPriorityMatch) {
            const p = orgPriorityMatch[1].toUpperCase();
            priority = p === 'A' ? 'Important' : p === 'B' ? 'Normal' : 'Hobby';
          }
        }

        let scheduled: string | undefined;
        let repeating: string | undefined;
        const schedMatch = block.content.match(/SCHEDULED:\s*<([^>]+)>/i);
        if (schedMatch) {
          const rawSched = schedMatch[1].trim();
          const dMatch = rawSched.match(/^(\d{4}-\d{2}-\d{2})/);
          if (dMatch) scheduled = dMatch[1];
          const repMatch = rawSched.match(/(\.{0,1}\+{1,2}\d+[dwmy])/);
          if (repMatch) repeating = repMatch[1];
        }

        let deadline: string | undefined;
        const deadMatch = block.content.match(/DEADLINE:\s*<([^>]+)>/i);
        if (deadMatch) {
          const rawDead = deadMatch[1].trim();
          const dMatch = rawDead.match(/^(\d{4}-\d{2}-\d{2})/);
          if (dMatch) deadline = dMatch[1];
          if (!repeating) {
            const repMatch = rawDead.match(/(\.{0,1}\+{1,2}\d+[dwmy])/);
            if (repMatch) repeating = repMatch[1];
          }
        }

        let createdAt = block.properties?.createdAt || block.properties?.['created-at'];
        if (!createdAt) {
          const rawCreated = block.createdAt || block['created-at'] || block['block/created-at'];
          if (rawCreated) createdAt = new Date(rawCreated).toISOString().slice(0, 10);
        }

        let completedAt = block.properties?.completedAt || block.properties?.['completed-at'] || block.properties?.['closed-at'];
        const closedMatch = block.content.match(/CLOSED:\s*[<\[]([^>\]]+)[>\]]/i);
        if (closedMatch) {
          const dMatch = closedMatch[1].trim().match(/^(\d{4}-\d{2}-\d{2})/);
          if (dMatch && !completedAt) completedAt = dMatch[1];
        }

        if (!completedAt && block.marker === 'DONE') {
          const rawUpdated = block.updatedAt || block['updated-at'] || block['block/updated-at'];
          if (rawUpdated) completedAt = new Date(rawUpdated).toISOString().slice(0, 10);
        }

        // Journal page date extraction for tasks logged on daily journals
        if (pageObj) {
          let journalDate: string | undefined;
          const rawJDay = pageObj['page/journal-day'] || pageObj['journal-day'] || pageObj['block/journal-day'] || pageObj.journalDay;
          if (rawJDay) {
            const s = String(rawJDay);
            if (s.length === 8) journalDate = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
          }
          if (!journalDate && pageName) {
            const m = pageName.match(/^(\d{4})[-_](\d{2})[-_](\d{2})/);
            if (m) journalDate = `${m[1]}-${m[2]}-${m[3]}`;
          }

          if (journalDate) {
            if (!createdAt) createdAt = journalDate;
            if (block.marker === 'DONE' && !completedAt) completedAt = journalDate;
          }
        }

        let dependsOn: string[] | undefined;
        const rawDepends = block.properties?.['depends-on'] || block.properties?.dependsOn || block.properties?.['depend-on'];
        if (rawDepends) {
          const str = String(rawDepends);
          const matches = str.matchAll(/\(\(([a-f0-9-]+)\)\)/gi);
          const uuids: string[] = [];
          for (const m of matches) {
            if (m[1]) uuids.push(m[1]);
          }
          if (uuids.length > 0) {
            dependsOn = uuids;
          }
        }

        tasks.push({
          uuid: block.uuid,
          content: block.content,
          title: cleanTitle || 'Untitled Task',
          project,
          pageName: pageName || 'Projects & Tasks',
          status: block.marker as TaskStatus,
          priority,
          repeating,
          scheduled,
          deadline,
          createdAt,
          completedAt,
          dependsOn,
        });
      }

      return tasks;
    } catch (err) {
      console.error('[ProjectTaskFlow] Error querying dashboard tasks:', err);
      return [];
    }
  }

  public async jumpToBlock(task: { uuid: string; project?: string; pageName?: string; [key: string]: any }): Promise<void> {
    try {
      let targetPage = task.pageName;
      if (!targetPage || targetPage === 'General') {
        const block = await logseq.Editor.getBlock(task.uuid);
        if (block && block.page) {
          const page = typeof block.page.id === 'number'
            ? await logseq.Editor.getPage(block.page.id)
            : block.page;
          targetPage = page?.originalName || page?.name;
        }
      }
      if (!targetPage || targetPage === 'General') {
        targetPage = (task.project && task.project !== 'General') ? task.project : 'Projects & Tasks';
      }
      await logseq.Editor.scrollToBlockInPage(targetPage, task.uuid);
    } catch (err) {
      console.warn('[ProjectTaskFlow] Error scrolling to block:', err);
    }
  }

  public async toggleTaskStatus(uuid: string, currentStatus: TaskStatus): Promise<TaskStatus> {
    try {
      const block = await logseq.Editor.getBlock(uuid);
      if (!block) return currentStatus;

      const timestamp = this.getTimestamp();
      let newStatus: TaskStatus = 'DONE';
      const prevMarker = (block.properties?.prevMarker || block.properties?.['prev-marker']) as TaskStatus;

      const project = extractProjectName(block, this.getPriorityCategories());

      const validRestores: TaskStatus[] = ['TODO', 'DOING', 'NOW', 'LATER', 'WAITING', 'CANCELLED'];
      if (currentStatus === 'DONE') {
        newStatus = prevMarker && validRestores.includes(prevMarker) ? prevMarker : 'TODO';
        const newContent = block.content.replace(/^DONE\s+/i, `${newStatus} `);
        await logseq.Editor.updateBlock(uuid, newContent);
        await logseq.Editor.upsertBlockProperty(uuid, 'completed-at', '');

        const title = cleanTaskTitle(newContent) || 'Task';

        if (project !== 'General') {
          await this.appendProjectLog(project, {
            timestamp,
            taskTitle: title,
            action: 'UPDATED',
            details: `Reopened (status set to ${newStatus})`,
          });
        }
      } else {
        newStatus = 'DONE';
        await logseq.Editor.upsertBlockProperty(uuid, 'prev-marker', currentStatus);
        await logseq.Editor.upsertBlockProperty(uuid, 'completed-at', timestamp);

        const newContent = block.content.replace(new RegExp(`^${currentStatus}\\s+`, 'i'), 'DONE ');
        await logseq.Editor.updateBlock(uuid, newContent);

        const title = cleanTaskTitle(newContent) || 'Task';

        if (project !== 'General') {
          await this.appendProjectLog(project, {
            timestamp,
            taskTitle: title,
            action: 'COMPLETED',
            details: `Status transitioned from ${currentStatus} to DONE`,
          });
        }
      }

      return newStatus;
    } catch (err) {
      console.error('[ProjectTaskFlow] Error toggling task status:', err);
      return currentStatus;
    }
  }

  public formatJournalDate(d: Date, format: string): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const day = d.getDate();
    const ord = (n: number) => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');

    return format
      .replace(/yyyy/g, d.getFullYear().toString())
      .replace(/yy/g, d.getFullYear().toString().slice(-2))
      .replace(/MMMM/g, d.toLocaleString('en-US', { month: 'long' }))
      .replace(/MMM/g, d.toLocaleString('en-US', { month: 'short' }))
      .replace(/MM/g, pad(d.getMonth() + 1))
      .replace(/\bM\b/g, (d.getMonth() + 1).toString())
      .replace(/do/g, ord(day))
      .replace(/dd/g, pad(day))
      .replace(/\bd\b/g, day.toString())
      .replace(/EEEE/g, d.toLocaleString('en-US', { weekday: 'long' }))
      .replace(/E/g, d.toLocaleString('en-US', { weekday: 'short' }));
  }

  public async getOrCreateJournalPage(dateStr: string): Promise<any> {
    const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    const year = parseInt(m[1], 10);
    const month = parseInt(m[2], 10) - 1;
    const day = parseInt(m[3], 10);
    const journalDay = parseInt(`${m[1]}${m[2]}${m[3]}`, 10);

    try {
      const qRes = await logseq.DB.datascriptQuery(`
        [:find (pull ?p [*])
         :where [?p :page/journal-day ${journalDay}]]
      `);
      if (qRes && qRes.length > 0 && qRes[0][0]) {
        return qRes[0][0];
      }
    } catch (e) {
      // Fallback
    }

    const configs = await logseq.App.getUserConfigs();
    const format = configs?.preferredDateFormat || 'yyyy-MM-dd';
    const dateObj = new Date(year, month, day);
    const pageName = this.formatJournalDate(dateObj, format);

    let page = await logseq.Editor.getPage(pageName);
    if (!page) {
      page = await logseq.Editor.createPage(
        pageName,
        { journalDay },
        { journal: true, redirect: false }
      );
    }
    return page;
  }

  private async ensureEmbedUnderHeading(
    pageName: string,
    headingText: string,
    taskUuid: string
  ): Promise<void> {
    const blocks = await logseq.Editor.getPageBlocksTree(pageName);
    if (!blocks) return;

    const embedText = `{{embed ((${taskUuid}))}}`;

    const hasEmbed = (tree: any[]): boolean => {
      for (const b of tree) {
        if (b.content && b.content.includes(taskUuid)) return true;
        if (b.children && hasEmbed(b.children)) return true;
      }
      return false;
    };

    if (hasEmbed(blocks)) return;

    let headingBlock = this.findBlockWithContent(blocks, headingText);
    if (!headingBlock) {
      // If the page only has one empty block at the top, replace it instead of creating a ghost bullet
      if (blocks.length === 1 && (!blocks[0].content || blocks[0].content.trim() === '')) {
        await logseq.Editor.updateBlock(blocks[0].uuid, headingText);
        headingBlock = blocks[0];
      } else {
        headingBlock = await logseq.Editor.appendBlockInPage(pageName, headingText);
      }
    }

    if (headingBlock) {
      // Clean up any empty child blocks under heading
      if (headingBlock.children) {
        for (const child of headingBlock.children) {
          if (!child.content || child.content.trim() === '') {
            await logseq.Editor.removeBlock(child.uuid);
          }
        }
      }
      await logseq.Editor.insertBlock(headingBlock.uuid, embedText, { sibling: false });
    }
  }

  public async cleanupEmptyJournalHeadings(pageName: string): Promise<void> {
    try {
      const blocks = await logseq.Editor.getPageBlocksTree(pageName);
      if (!blocks) return;

      const targetHeadings = ['### 📅 Scheduled Tasks', '### ⏳ Due Today (Deadlines)'];

      for (const headingText of targetHeadings) {
        const headingBlock = this.findBlockWithContent(blocks, headingText);
        if (!headingBlock) continue;

        const children = headingBlock.children || [];
        const validChildren: any[] = [];
        for (const child of children) {
          if (!child.content || child.content.trim() === '') {
            await logseq.Editor.removeBlock(child.uuid);
          } else {
            validChildren.push(child);
          }
        }

        if (validChildren.length === 0) {
          await logseq.Editor.removeBlock(headingBlock.uuid);
        }
      }
    } catch (e) {
      console.warn(`[ProjectTaskFlow] Error cleaning empty headings on ${pageName}:`, e);
    }
  }

  private async removeEmbedFromPage(pageName: string, taskUuid: string): Promise<void> {
    const blocks = await logseq.Editor.getPageBlocksTree(pageName);
    if (!blocks) return;

    let removed = false;
    const findAndRemove = async (tree: any[]): Promise<boolean> => {
      for (const b of tree) {
        if (b.content && b.content.includes(`((${taskUuid}))`)) {
          await logseq.Editor.removeBlock(b.uuid);
          removed = true;
          return true;
        }
        if (b.children && (await findAndRemove(b.children))) {
          return true;
        }
      }
      return false;
    };

    await findAndRemove(blocks);
    if (removed) {
      await this.cleanupEmptyJournalHeadings(pageName);
    }
  }

  public async removeTaskFromJournals(
    taskUuid: string,
    scheduledDate?: string,
    deadlineDate?: string
  ): Promise<void> {
    try {
      const dates = new Set<string>();
      if (scheduledDate) dates.add(scheduledDate);
      if (deadlineDate) dates.add(deadlineDate);

      for (const d of dates) {
        const page = await this.getOrCreateJournalPage(d);
        if (page) {
          const pageName = page.name || page.originalName;
          await this.removeEmbedFromPage(pageName, taskUuid);
          await this.cleanupEmptyJournalHeadings(pageName);
        }
      }
    } catch (err) {
      console.error(`[ProjectTaskFlow] Error removing task ${taskUuid} from journals:`, err);
    }
  }

  public async cleanupAllOrphanedJournalEmbeds(): Promise<number> {
    let cleaned = 0;
    try {
      let res: any;
      try {
        res = await logseq.DB.datascriptQuery(`
          [:find (pull ?b [:block/uuid :block/content {:block/page [:block/name :block/original-name :page/journal?]}])
           :where
           [?p :page/journal? true]
           [?b :block/page ?p]
           [?b :block/content ?content]
           [(clojure.string/includes? ?content "{{embed ((")]]
        `);
      } catch {
        res = await logseq.DB.datascriptQuery(`
          [:find (pull ?b [:block/uuid :block/content {:block/page [:block/name :block/original-name :page/journal?]}])
           :where
           [?b :block/content ?content]
           [(clojure.string/includes? ?content "{{embed ((")]]
        `);
      }

      if (res && Array.isArray(res)) {
        for (const item of res) {
          const b = item[0];
          if (!b || !b['block/content']) continue;
          const match = b['block/content'].match(/\{\{embed \(\(([a-zA-Z0-9_-]+)\)\)\}\}/);
          if (match && match[1]) {
            const targetUuid = match[1];
            const targetBlock = await logseq.Editor.getBlock(targetUuid);
            if (!targetBlock) {
              await logseq.Editor.removeBlock(b['block/uuid'] || b.uuid);
              cleaned++;
              const pageName = b['block/page']?.['block/name'] || b['block/page']?.['block/original-name'];
              if (pageName) {
                await this.cleanupEmptyJournalHeadings(pageName);
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn('[ProjectTaskFlow] Error cleaning orphaned journal embeds:', e);
    }
    return cleaned;
  }

  public async deleteTask(uuid: string): Promise<void> {
    try {
      const block = await logseq.Editor.getBlock(uuid);
      if (!block) return;

      const scheduled = block.properties?.scheduled || block.properties?.['journal-scheduled'];
      const deadline = block.properties?.deadline || block.properties?.['journal-deadline'];

      await this.removeTaskFromJournals(uuid, scheduled, deadline);
      await logseq.Editor.removeBlock(uuid);
      logseq.UI.showMsg('Task deleted and removed from calendar', 'success');
    } catch (err) {
      console.error('[ProjectTaskFlow] Error deleting task:', err);
      logseq.UI.showMsg(`Error deleting task: ${err}`, 'error');
    }
  }

  public async syncTaskToJournal(
    taskUuid: string,
    scheduledDate?: string,
    deadlineDate?: string
  ): Promise<void> {
    try {
      const block = await logseq.Editor.getBlock(taskUuid);
      const prevScheduled = block?.properties?.['journal-scheduled'] as string | undefined;
      const prevDeadline = block?.properties?.['journal-deadline'] as string | undefined;

      if (prevScheduled && prevScheduled !== scheduledDate) {
        const oldPage = await this.getOrCreateJournalPage(prevScheduled);
        if (oldPage) {
          await this.removeEmbedFromPage(oldPage.name || oldPage.originalName, taskUuid);
        }
      }

      if (scheduledDate) {
        const schedPage = await this.getOrCreateJournalPage(scheduledDate);
        if (schedPage) {
          await this.ensureEmbedUnderHeading(
            schedPage.name || schedPage.originalName,
            '### 📅 Scheduled Tasks',
            taskUuid
          );
          await logseq.Editor.upsertBlockProperty(taskUuid, 'journal-scheduled', scheduledDate);
        }
      } else if (prevScheduled) {
        await logseq.Editor.removeBlockProperty(taskUuid, 'journal-scheduled');
      }

      if (prevDeadline && prevDeadline !== deadlineDate) {
        const oldPage = await this.getOrCreateJournalPage(prevDeadline);
        if (oldPage) {
          await this.removeEmbedFromPage(oldPage.name || oldPage.originalName, taskUuid);
        }
      }

      if (deadlineDate && deadlineDate !== scheduledDate) {
        const duePage = await this.getOrCreateJournalPage(deadlineDate);
        if (duePage) {
          await this.ensureEmbedUnderHeading(
            duePage.name || duePage.originalName,
            '### ⏳ Due Today (Deadlines)',
            taskUuid
          );
          await logseq.Editor.upsertBlockProperty(taskUuid, 'journal-deadline', deadlineDate);
        }
      } else if (prevDeadline) {
        await logseq.Editor.removeBlockProperty(taskUuid, 'journal-deadline');
      }
    } catch (err) {
      console.error(`[ProjectTaskFlow] Error syncing task ${taskUuid} to journal:`, err);
    }
  }

  public async syncAllTasksToJournals(): Promise<number> {
    await this.cleanupAllOrphanedJournalEmbeds();
    const tasks = await this.fetchTasksForDashboard();
    const actionable = tasks.filter(
      (t) => t.status !== 'DONE' && t.status !== 'CANCELLED' && (t.scheduled || t.deadline)
    );
    let count = 0;
    for (const t of actionable) {
      await this.syncTaskToJournal(t.uuid, t.scheduled, t.deadline);
      count++;
    }
    return count;
  }

  public async openTodayJournal(): Promise<void> {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const page = await this.getOrCreateJournalPage(todayStr);
    if (page) {
      await logseq.Editor.openInRightSidebar(page.name || page.originalName);
      logseq.UI.showMsg(`Opened Journal for ${todayStr}`, 'info');
    }
  }
}
