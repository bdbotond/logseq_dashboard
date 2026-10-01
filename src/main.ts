import '@logseq/libs';
import mainCss from './styles/main.css?inline';
import { LogseqService } from './services/logseqService';
import { TaskWatcher } from './services/taskWatcher';
import { DashboardRenderer } from './ui/dashboardRenderer';
import { QuickCaptureModal } from './ui/quickCaptureModal';
import { DependencyModal } from './ui/dependencyModal';
import { ICONS } from './ui/icons';

async function main() {
  console.log('[ProjectTaskFlow] Plugin loading...');

  const logseqService = LogseqService.getInstance();
  const taskWatcher = TaskWatcher.getInstance();
  const dashboardRenderer = DashboardRenderer.getInstance();

  const appContainer = document.getElementById('app') || document.body;
  const quickCaptureModal = new QuickCaptureModal(appContainer);

  // Inject plugin styles into host Logseq DOM
  logseq.provideStyle(mainCss);

  // Initialize task watcher for auto-logging completions and live dashboard sync
  await taskWatcher.init();

  // Register interactive model handlers for provideUI buttons
  logseq.provideModel({
    async openQuickCapture() {
      await quickCaptureModal.open();
    },

    async openDashboardModal() {
      await dashboardRenderer.openFullDashboard(appContainer);
    },

    async refreshMacroDashboard() {
      await dashboardRenderer.refreshAllSlots();
      logseq.UI.showMsg('Dashboard refreshed', 'success');
    },

    async openProjectPage(e: any) {
      const project = e.dataset?.project;
      const page = e.dataset?.page;
      if (project && project !== 'General') {
        const existing = await logseq.Editor.getPage(project);
        if (!existing) {
          await logseq.Editor.createPage(project);
        }
        await logseq.Editor.openInRightSidebar(project);
      } else if (page && page !== 'General') {
        await logseq.Editor.openInRightSidebar(page);
      } else {
        await logseq.Editor.openInRightSidebar('Projects & Tasks');
      }
    },

    async jumpToTaskBlock(e: any) {
      const uuid = e.dataset?.uuid;
      const project = e.dataset?.project;
      const page = e.dataset?.page;
      if (uuid) {
        await logseqService.jumpToBlock({
          uuid,
          project: project || '',
          pageName: page || '',
        });
      }
    },

    async openEditDependencies(e: any) {
      const uuid = e.dataset?.uuid;
      if (uuid) {
        const tasks = await logseqService.fetchTasksForDashboard();
        const task = tasks.find((t) => t.uuid === uuid);
        if (task) {
          await DependencyModal.getInstance().open(task);
        }
      }
    },

    async syncTasksToJournals() {
      const count = await logseqService.syncAllTasksToJournals();
      logseq.UI.showMsg(`Synced ${count} task(s) to Daily Journals for Calendar`, 'success');
      await dashboardRenderer.refreshAllSlots();
    },

    async openJournalsCalendar() {
      await logseqService.openTodayJournal();
    },

    async toggleMacroTask(e: any) {
      const uuid = e.dataset?.uuid;
      const status = e.dataset?.status;
      if (uuid && status) {
        await logseqService.toggleTaskStatus(uuid, status);
        await dashboardRenderer.refreshAllSlots();
      }
    },
  });

  // Register toolbar buttons (Professional icons without emojis)
  logseq.App.registerUIItem('toolbar', {
    key: 'ptf-quick-task-toolbar',
    template: `
      <a class="button" data-on-click="openQuickCapture" title="Project Flow: Quick Task Capture">
        ${ICONS.plus}
      </a>
    `,
  });

  logseq.App.registerUIItem('toolbar', {
    key: 'ptf-dashboard-toolbar',
    template: `
      <a class="button" data-on-click="openDashboardModal" title="Project Flow: Dashboard & Mindmap">
        ${ICONS.kanban}
      </a>
    `,
  });

  // Register slash commands
  logseq.Editor.registerSlashCommand('Project Dashboard', async () => {
    await logseq.Editor.insertAtEditingCursor('{{renderer :project-dashboard}}');
  });

  logseq.Editor.registerSlashCommand('Quick Task', async () => {
    await quickCaptureModal.open();
  });

  logseq.Editor.registerSlashCommand('Initialize Projects & Tasks Page', async () => {
    await logseqService.createMasterTasksPage();
    logseq.UI.showMsg('Master Projects & Tasks page initialized', 'success');
  });

  logseq.Editor.registerSlashCommand('Sync Tasks to Journals', async () => {
    const count = await logseqService.syncAllTasksToJournals();
    logseq.UI.showMsg(`Synced ${count} task(s) to Daily Journals`, 'success');
    await dashboardRenderer.refreshAllSlots();
  });

  // Register macro renderer for {{renderer :project-dashboard}}
  logseq.App.onMacroRendererSlotted(async ({ slot, payload }) => {
    const [type] = payload.arguments;
    if (type !== ':project-dashboard') return;
    await dashboardRenderer.renderMacroSlot(slot);
  });

  // Register Command Palette items
  logseq.App.registerCommandPalette(
    {
      key: 'ptf-cmd-quick-task',
      label: 'Project Flow: Quick Task Capture',
      keybinding: {
        binding: 'mod+shift+t',
      },
    },
    async () => {
      await quickCaptureModal.open();
    }
  );

  logseq.App.registerCommandPalette(
    {
      key: 'ptf-cmd-open-dashboard',
      label: 'Project Flow: Open Dashboard & Mindmap',
    },
    async () => {
      await dashboardRenderer.openFullDashboard(appContainer);
    }
  );

  logseq.App.registerCommandPalette(
    {
      key: 'ptf-cmd-init-page',
      label: 'Project Flow: Initialize Master Projects & Tasks Page',
    },
    async () => {
      await logseqService.createMasterTasksPage();
      logseq.UI.showMsg('Master Projects & Tasks page ready', 'success');
    }
  );

  logseq.App.registerCommandPalette(
    {
      key: 'ptf-cmd-sync-journals',
      label: 'Project Flow: Sync All Tasks to Daily Journals (Calendar)',
    },
    async () => {
      const count = await logseqService.syncAllTasksToJournals();
      logseq.UI.showMsg(`Synced ${count} task(s) to Daily Journals`, 'success');
      await dashboardRenderer.refreshAllSlots();
    }
  );

  logseq.App.registerCommandPalette(
    {
      key: 'ptf-cmd-open-today-journal',
      label: "Project Flow: Open Today's Journal (Journals Calendar)",
    },
    async () => {
      await logseqService.openTodayJournal();
    }
  );

  console.log('[ProjectTaskFlow] Plugin loaded successfully.');
}

// Bootstrap Logseq plugin
logseq.ready(main).catch(console.error);
