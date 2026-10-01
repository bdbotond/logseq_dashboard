import '@logseq/libs';
import { LogseqService } from './services/logseqService';
import { TaskWatcher } from './services/taskWatcher';
import { DashboardRenderer } from './ui/dashboardRenderer';
import { QuickCaptureModal } from './ui/quickCaptureModal';

async function main() {
  console.log('[ProjectTaskFlow] Plugin loading...');

  const logseqService = LogseqService.getInstance();
  const taskWatcher = TaskWatcher.getInstance();
  const dashboardRenderer = DashboardRenderer.getInstance();

  const appContainer = document.getElementById('app') || document.body;
  const quickCaptureModal = new QuickCaptureModal(appContainer);

  // Initialize task watcher for auto-logging completions
  await taskWatcher.init();

  // Register interactive model handlers for provideUI buttons
  logseq.provideModel({
    async openQuickCapture() {
      await quickCaptureModal.open();
    },

    async openDashboardModal() {
      await dashboardRenderer.openFullDashboard(appContainer, 'mindmap');
    },

    async openDashboardTable() {
      await dashboardRenderer.openFullDashboard(appContainer, 'table');
    },

    async refreshMacroDashboard(e: any) {
      const slot = e.dataset.slot;
      if (slot) {
        await dashboardRenderer.renderMacroSlot(slot);
        logseq.UI.showMsg('Dashboard refreshed', 'success');
      }
    },

    async openProjectPage(e: any) {
      const project = e.dataset.project;
      if (project) {
        await logseq.Editor.openInRightSidebar(project);
      }
    },
  });

  // Register toolbar buttons
  logseq.App.registerUIItem('toolbar', {
    key: 'ptf-quick-task-toolbar',
    template: `
      <a class="button" data-on-click="openQuickCapture" title="Project Flow: Quick Task Capture">
        <i class="ti ti-plus"></i>
      </a>
    `,
  });

  logseq.App.registerUIItem('toolbar', {
    key: 'ptf-dashboard-toolbar',
    template: `
      <a class="button" data-on-click="openDashboardModal" title="Project Flow: Dashboard & Mindmap">
        <i class="ti ti-layout-kanban"></i>
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
    logseq.UI.showMsg('Master Projects & Tasks page initialized!', 'success');
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
      label: '⚡ Project Flow: Quick Task Capture',
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
      label: '📊 Project Flow: Open Live Mindmap & Summary Dashboard',
    },
    async () => {
      await dashboardRenderer.openFullDashboard(appContainer, 'mindmap');
    }
  );

  logseq.App.registerCommandPalette(
    {
      key: 'ptf-cmd-init-page',
      label: '📋 Project Flow: Initialize Master Projects & Tasks Page',
    },
    async () => {
      await logseqService.createMasterTasksPage();
      logseq.UI.showMsg('Master Projects & Tasks page ready!', 'success');
    }
  );

  console.log('[ProjectTaskFlow] Plugin loaded successfully.');
}

// Bootstrap Logseq plugin
logseq.ready(main).catch(console.error);
