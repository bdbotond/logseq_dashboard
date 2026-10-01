import { LogseqService } from './logseqService';

export class TaskWatcher {
  private static instance: TaskWatcher;
  private blockStatusCache = new Map<string, string>();
  private isInitialized = false;
  private logseqService = LogseqService.getInstance();
  private debounceTimer: any = null;

  public static getInstance(): TaskWatcher {
    if (!TaskWatcher.instance) {
      TaskWatcher.instance = new TaskWatcher();
    }
    return TaskWatcher.instance;
  }

  /**
   * Initialize task status cache and start listening for block changes
   */
  public async init(): Promise<void> {
    if (this.isInitialized) return;
    this.isInitialized = true;

    // Pre-populate cache with current task statuses
    try {
      const initialTasks = await this.logseqService.fetchTasksForDashboard();
      for (const t of initialTasks) {
        if (t.uuid && t.status) {
          this.blockStatusCache.set(t.uuid, t.status);
        }
      }
    } catch (err) {
      console.warn('[ProjectTaskFlow] Error pre-populating task watcher cache:', err);
    }

    // Register DB onChanged listener
    logseq.DB.onChanged(async ({ blocks }: { blocks: any[] }) => {
      if (!blocks || !Array.isArray(blocks)) return;

      for (const block of blocks) {
        if (!block || !block.uuid || !block.marker) continue;

        const prevMarker = this.blockStatusCache.get(block.uuid);
        const currentMarker = block.marker;

        // Detect status change to DONE
        if (currentMarker === 'DONE' && prevMarker && prevMarker !== 'DONE') {
          await this.handleTaskCompleted(block, prevMarker);
        }

        // Cache update
        this.blockStatusCache.set(block.uuid, currentMarker);
      }
    });

    console.log('[ProjectTaskFlow] TaskWatcher initialized and listening to block changes.');
  }

  /**
   * Handle completion event for a task
   */
  private async handleTaskCompleted(block: any, prevMarker: string): Promise<void> {
    const timestamp = this.logseqService.getTimestamp();

    // Upsert completed-at property onto the block
    try {
      await logseq.Editor.upsertBlockProperty(block.uuid, 'completed-at', timestamp);
    } catch (e) {
      console.warn('[ProjectTaskFlow] Failed to set completed-at property on block:', e);
    }

    // Determine project
    let project = block.properties?.project;
    if (!project) {
      const match = block.content?.match(/(?:#?\[\[([^\]]+)\]\]|#([\w-]+))/);
      if (match) {
        project = match[1] || match[2];
      } else if (block.page?.originalName) {
        const pageName = block.page.originalName;
        if (pageName !== 'Projects & Tasks' && !pageName.toLowerCase().startsWith('contents')) {
          project = pageName;
        }
      }
    }

    if (!project) {
      project = 'General';
    }

    // Extract title
    let title = block.content || 'Untitled Task';
    title = title.replace(/^(TODO|DOING|DONE|LATER|NOW|NEXT|WAITING|CANCELLED)\s+/i, '');
    title = title.replace(/SCHEDULED:\s*<[^>]+>/gi, '');
    title = title.replace(/DEADLINE:\s*<[^>]+>/gi, '');
    title = title.replace(/#?\[\[[^\]]+\]\]/g, '');
    title = title.replace(/#[\w-]+/g, '');
    title = title.trim().split('\n')[0];

    // Append to target project log
    await this.logseqService.appendProjectLog(project, {
      timestamp,
      taskTitle: title,
      action: 'COMPLETED',
      details: `Status transitioned from ${prevMarker} to DONE`,
    });

    logseq.UI.showMsg(`Task "${title}" completed! Logged in [[${project}]]`, 'success');
  }
}
