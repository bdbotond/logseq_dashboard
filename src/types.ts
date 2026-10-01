export type TaskStatus = 'TODO' | 'NEXT' | 'DOING' | 'LATER' | 'NOW' | 'DONE' | 'WAITING' | 'CANCELLED';

export interface ProjectTask {
  uuid: string;
  content: string;
  title: string;
  project: string;
  status: TaskStatus;
  scheduled?: string;
  deadline?: string;
  createdAt?: string;
  completedAt?: string;
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
}

export interface CreateTaskParams {
  project: string;
  title: string;
  status: TaskStatus;
  scheduled?: string;
}
