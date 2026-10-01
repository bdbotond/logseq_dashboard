export type TaskStatus = 'TODO' | 'DOING' | 'NOW' | 'LATER' | 'DONE' | 'WAITING' | 'CANCELLED';

export interface TaskDependency {
  uuid: string;
  title: string;
}

export interface ProjectTask {
  uuid: string;
  content: string;
  title: string;
  project: string;
  pageName?: string;
  status: TaskStatus;
  priority?: string;
  repeating?: string;
  scheduled?: string;
  deadline?: string;
  createdAt?: string;
  completedAt?: string;
  dependsOn?: string[];
}

export interface ProjectLogEntry {
  timestamp: string;
  taskTitle: string;
  action: 'ADDED' | 'COMPLETED' | 'UPDATED' | 'SCHEDULED';
  details?: string;
}

export interface DashboardFilter {
  project: string;
  status: string;
  search: string;
  priority?: string;
}

export interface CreateTaskParams {
  project: string;
  title: string;
  status: TaskStatus;
  priority?: string;
  scheduled?: string;
  deadline?: string;
  repeating?: string;
  dependsOn?: TaskDependency[];
  blocks?: TaskDependency[];
}


