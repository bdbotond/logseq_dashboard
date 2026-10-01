import { DashboardRenderer } from '../ui/dashboardRenderer';
import { LogseqService, cleanTaskTitle, extractProjectName } from './logseqService';

export class TaskWatcher {
  private static instance: TaskWatcher;
  private blockStatusCache = new Map<string, string>();
  private knownTasks = new Map<string, { scheduled?: string; deadline?: string }>();
  private isInitialized = false;
  private logseqService = LogseqService.getInstance();
  private debounceTimer: any = null;

  public static getInstance(): TaskWatcher {
    if (!TaskWatcher.instance) {
      TaskWatcher.instance = new TaskWatcher();
    }
    return TaskWatcher.instance;
  }

  public async init(): Promise<void> {
    if (this.isInitialized) return;
    this.isInitialized = true;

    try {
      const initialTasks = await this.logseqService.fetchTasksForDashboard();
      for (const t of initialTasks) {
        if (t.uuid) {
          if (t.status) this.blockStatusCache.set(t.uuid, t.status);
          this.knownTasks.set(t.uuid, { scheduled: t.scheduled, deadline: t.deadline });
        }
      }
      // Also cleanup any orphaned journal embeds from earlier deletions
      await this.logseqService.cleanupAllOrphanedJournalEmbeds();
    } catch (err) {
      console.warn('[ProjectTaskFlow] Error pre-populating task watcher cache:', err);
    }

    logseq.DB.onChanged(async ({ blocks }: { blocks: any[] }) => {
      if (!blocks || !Array.isArray(blocks)) return;

      let hasRelevantChange = false;

      for (const block of blocks) {
        if (!block || !block.uuid) continue;

        const prevMarker = this.blockStatusCache.get(block.uuid);
        const currentMarker = block.marker;

        if (currentMarker === 'DONE' && prevMarker && prevMarker !== 'DONE') {
          hasRelevantChange = true;
          await this.handleTaskCompleted(block, prevMarker);
        } else if (prevMarker !== currentMarker) {
          hasRelevantChange = true;
        }

        if (currentMarker) {
          this.blockStatusCache.set(block.uuid, currentMarker);
        } else if (prevMarker) {
          this.blockStatusCache.delete(block.uuid);
          hasRelevantChange = true;
        }
      }

      // Automatically refresh in-page dashboard when tasks change
      if (hasRelevantChange) {
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(async () => {
          await this.detectAndCleanupDeletedTasks();
          await DashboardRenderer.getInstance().refreshAllSlots();
        }, 300);
      }
    });

    console.log('[ProjectTaskFlow] TaskWatcher active.');
  }

  public async detectAndCleanupDeletedTasks(): Promise<void> {
    try {
      const currentTasks = await this.logseqService.fetchTasksForDashboard();
      const currentUuidSet = new Set(currentTasks.map((t) => t.uuid));

      for (const [uuid, meta] of this.knownTasks.entries()) {
        if (!currentUuidSet.has(uuid)) {
          // Task deleted from graph outline! Clean up its calendar embeds
          await this.logseqService.removeTaskFromJournals(uuid, meta.scheduled, meta.deadline);
          this.knownTasks.delete(uuid);
          this.blockStatusCache.delete(uuid);
        }
      }

      for (const t of currentTasks) {
        if (t.uuid) {
          this.knownTasks.set(t.uuid, { scheduled: t.scheduled, deadline: t.deadline });
        }
      }
    } catch (err) {
      console.warn('[ProjectTaskFlow] Error detecting deleted tasks in watcher:', err);
    }
  }

  private recentlyCompleted = new Set<string>();

  private async handleTaskCompleted(block: any, prevMarker: string): Promise<void> {
    if (this.recentlyCompleted.has(block.uuid)) return;
    this.recentlyCompleted.add(block.uuid);
    setTimeout(() => this.recentlyCompleted.delete(block.uuid), 3000);

    const timestamp = this.logseqService.getTimestamp();

    try {
      await logseq.Editor.upsertBlockProperty(block.uuid, 'completed-at', timestamp);
    } catch (e) {
      console.warn('[ProjectTaskFlow] Failed to set completed-at property on block:', e);
    }

    const project = extractProjectName(block, this.logseqService.getPriorityCategories());
    const title = cleanTaskTitle(block.content || '') || 'Untitled Task';

    if (project !== 'General') {
      await this.logseqService.appendProjectLog(project, {
        timestamp,
        taskTitle: title,
        action: 'COMPLETED',
        details: `Status transitioned from ${prevMarker} to DONE`,
      });
      logseq.UI.showMsg(`Task "${title}" completed and logged in [[${project}]]`, 'success');
    }
  }
}
