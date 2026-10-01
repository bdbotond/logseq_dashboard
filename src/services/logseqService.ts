import { CreateTaskParams, ProjectLogEntry, ProjectTask, TaskStatus } from '../types';

export class LogseqService {
  private static instance: LogseqService;

  public static getInstance(): LogseqService {
    if (!LogseqService.instance) {
      LogseqService.instance = new LogseqService();
    }
    return LogseqService.instance;
  }

  /**
   * Formats ISO or human-readable local timestamp
   */
  public getTimestamp(): string {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const yyyy = now.getFullYear();
    const mm = pad(now.getMonth() + 1);
    const dd = pad(now.getDate());
    const hh = pad(now.getHours());
    const min = pad(now.getMinutes());
    return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
  }

  /**
   * Fetch all user project pages (excludes journals and built-in templates)
   */
  public async getAllProjects(): Promise<string[]> {
    try {
      const pages = await logseq.Editor.getAllPages();
      if (!pages) return [];

      const filtered = pages
        .filter((p: any) => {
          if (!p || !p.originalName) return false;
          if (p['journal?']) return false;
          // exclude system and config pages
          const name = p.originalName.toLowerCase();
          if (name.startsWith('logseq/') || name.startsWith('contents') || name === 'templates') return false;
          return true;
        })
        .map((p: any) => p.originalName)
        .sort((a: string, b: string) => a.localeCompare(b));

      return filtered;
    } catch (err) {
      console.error('[ProjectTaskFlow] Error fetching projects:', err);
      return [];
    }
  }

  /**
   * Create or initialize the Master Tasks Page with splits and bottom dashboard
   */
  public async createMasterTasksPage(pageName = 'Projects & Tasks'): Promise<string> {
    try {
      let page = await logseq.Editor.getPage(pageName);
      if (!page) {
        page = await logseq.Editor.createPage(
          pageName,
          { icon: '📋', description: 'Central Master Task Flow & Projects Overview' },
          { createFirstBlock: false, redirect: true }
        );
      }

      // Check if blocks already exist
      const blocks = await logseq.Editor.getPageBlocksTree(pageName);
      if (!blocks || blocks.length === 0) {
        // Add header and introduction
        const headerBlock = await logseq.Editor.appendBlockInPage(
          pageName,
          '# Master Task Management\nCentral workspace for managing all project splits, active milestones, and next tasks.'
        );

        // Add Projects section
        if (headerBlock) {
          const projectsSection = await logseq.Editor.insertBlock(
            headerBlock.uuid,
            '## Active Projects\n*Add project tasks and splits below:*',
            { sibling: true }
          );

          // Get existing projects and add sub-bullets
          const projects = await this.getAllProjects();
          const targetProjects = projects.slice(0, 4); // show top existing projects as initial splits

          let lastBlockUuid = projectsSection?.uuid;
          for (const proj of targetProjects) {
            if (lastBlockUuid) {
              const projSplit = await logseq.Editor.insertBlock(
                projectsSection!.uuid,
                `### [[${proj}]]`,
                { sibling: false }
              );
              if (projSplit) {
                await logseq.Editor.insertBlock(
                  projSplit.uuid,
                  `TODO Initial project setup for [[${proj}]]\nSCHEDULED: <${new Date().toISOString().slice(0, 10)}>`,
                  { sibling: false }
                );
              }
            }
          }

          // Add Dashboard section with custom renderer at bottom
          await logseq.Editor.appendBlockInPage(
            pageName,
            '## Project Dashboard & Mindmap\n{{renderer :project-dashboard}}'
          );
        }
      } else {
        // Check if renderer exists, if not append it to bottom
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

  /**
   * Append an audit entry to the target project's dedicated "## Project Log" section
   */
  public async appendProjectLog(projectName: string, entry: ProjectLogEntry): Promise<void> {
    try {
      // Ensure target project page exists
      let projectPage = await logseq.Editor.getPage(projectName);
      if (!projectPage) {
        projectPage = await logseq.Editor.createPage(projectName);
      }

      const blocks = await logseq.Editor.getPageBlocksTree(projectName);
      let logSectionBlock = blocks ? blocks.find((b: any) => b.content && b.content.trim().startsWith('## Project Log')) : null;

      if (!logSectionBlock) {
        logSectionBlock = await logseq.Editor.appendBlockInPage(
          projectName,
          '## Project Log\n*Automated audit history of tasks and milestones*'
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

  /**
   * Add a new task to master outline or project outline and append audit log
   */
  public async addTaskToProject(params: CreateTaskParams): Promise<void> {
    try {
      const scheduledStr = params.scheduled ? `\nSCHEDULED: <${params.scheduled}>` : '';
      const taskLine = `${params.status} ${params.title} #[[${params.project}]]${scheduledStr}`;

      // Check if Master Tasks Page exists
      const masterPageName = 'Projects & Tasks';
      const masterPage = await logseq.Editor.getPage(masterPageName);

      if (masterPage) {
        const blocks = await logseq.Editor.getPageBlocksTree(masterPageName);
        // Find project section if present
        let projectBlock = blocks ? this.findBlockWithContent(blocks, `[[${params.project}]]`) : null;
        if (!projectBlock) {
          // Append under master page
          projectBlock = await logseq.Editor.appendBlockInPage(masterPageName, `### [[${params.project}]]`);
        }

        if (projectBlock) {
          const inserted = await logseq.Editor.insertBlock(projectBlock.uuid, taskLine, { sibling: false });
          if (inserted) {
            await logseq.Editor.upsertBlockProperty(inserted.uuid, 'created-at', this.getTimestamp());
            await logseq.Editor.upsertBlockProperty(inserted.uuid, 'project', params.project);
          }
        }
      } else {
        // Master page not yet initialized, insert into project page directly
        let projectPage = await logseq.Editor.getPage(params.project);
        if (!projectPage) {
          projectPage = await logseq.Editor.createPage(params.project);
        }
        const inserted = await logseq.Editor.appendBlockInPage(params.project, taskLine);
        if (inserted) {
          await logseq.Editor.upsertBlockProperty(inserted.uuid, 'created-at', this.getTimestamp());
          await logseq.Editor.upsertBlockProperty(inserted.uuid, 'project', params.project);
        }
      }

      // Log task creation in project audit log
      await this.appendProjectLog(params.project, {
        timestamp: this.getTimestamp(),
        taskTitle: params.title,
        action: 'ADDED',
        details: `Initial status: ${params.status}${params.scheduled ? `, Scheduled: ${params.scheduled}` : ''}`,
      });

      logseq.UI.showMsg(`Task added to [[${params.project}]]`, 'success');
    } catch (err) {
      console.error('[ProjectTaskFlow] Error adding task:', err);
      logseq.UI.showMsg(`Error adding task: ${err}`, 'error');
      throw err;
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

  /**
   * Fetch all tasks across projects for summary table and mindmap
   */
  public async fetchTasksForDashboard(): Promise<ProjectTask[]> {
    try {
      const query = `
        [:find (pull ?b [*])
         :where
         [?b :block/marker ?marker]
         [(contains? #{"TODO" "DOING" "DONE" "LATER" "NOW" "NEXT" "WAITING" "CANCELLED"} ?marker)]]
      `;

      const results = await logseq.DB.datascriptQuery(query);
      if (!results || !Array.isArray(results)) return [];

      const tasks: ProjectTask[] = [];

      for (const res of results) {
        const block = Array.isArray(res) ? res[0] : res;
        if (!block || !block.content || !block.marker) continue;

        // Determine project
        let project = '';
        if (block.properties && block.properties.project) {
          project = block.properties.project;
        } else {
          // Check block content for [[Project]] or #[[Project]]
          const match = block.content.match(/(?:#?\[\[([^\]]+)\]\]|#([\w-]+))/);
          if (match) {
            project = match[1] || match[2];
          } else if (block.page && block.page.originalName) {
            // Check page name
            const pageName = block.page.originalName;
            if (pageName !== 'Projects & Tasks' && !pageName.toLowerCase().startsWith('contents')) {
              project = pageName;
            }
          }
        }

        if (!project) {
          project = 'General';
        }

        // Extract title (clean marker, tags, schedule)
        let cleanTitle = block.content;
        cleanTitle = cleanTitle.replace(/^(TODO|DOING|DONE|LATER|NOW|NEXT|WAITING|CANCELLED)\s+/i, '');
        cleanTitle = cleanTitle.replace(/SCHEDULED:\s*<[^>]+>/gi, '');
        cleanTitle = cleanTitle.replace(/DEADLINE:\s*<[^>]+>/gi, '');
        cleanTitle = cleanTitle.replace(/#?\[\[[^\]]+\]\]/g, '');
        cleanTitle = cleanTitle.replace(/#[\w-]+/g, '');
        cleanTitle = cleanTitle.trim().split('\n')[0]; // first line only

        // Extract SCHEDULED
        const schedMatch = block.content.match(/SCHEDULED:\s*<([^>]+)>/i);
        const scheduled = schedMatch ? schedMatch[1] : undefined;

        // Extract DEADLINE
        const deadMatch = block.content.match(/DEADLINE:\s*<([^>]+)>/i);
        const deadline = deadMatch ? deadMatch[1] : undefined;

        // Extract Created / Completed timestamps
        let createdAt = block.properties?.createdAt || block.properties?.['created-at'];
        if (!createdAt && block.createdAt) {
          createdAt = new Date(block.createdAt).toISOString().slice(0, 10);
        }

        let completedAt = block.properties?.completedAt || block.properties?.['completed-at'];
        if (!completedAt && block.marker === 'DONE' && block.updatedAt) {
          completedAt = new Date(block.updatedAt).toISOString().slice(0, 10);
        }

        tasks.push({
          uuid: block.uuid,
          content: block.content,
          title: cleanTitle || 'Untitled Task',
          project,
          status: block.marker as TaskStatus,
          scheduled,
          deadline,
          createdAt,
          completedAt,
        });
      }

      return tasks;
    } catch (err) {
      console.error('[ProjectTaskFlow] Error querying dashboard tasks:', err);
      return [];
    }
  }

  /**
   * Jump to specific block in Logseq editor
   */
  public async jumpToBlock(task: ProjectTask): Promise<void> {
    try {
      await logseq.Editor.scrollToBlockInPage(task.project, task.uuid);
    } catch (err) {
      console.warn('[ProjectTaskFlow] Error scrolling to block:', err);
    }
  }
}
