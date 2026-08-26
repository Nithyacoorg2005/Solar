export type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type NotificationStatus = 'not_required' | 'sent' | 'failed' | 'skipped';
export type TriggerType = 'manual' | 'scheduled';

export interface Inspection {
  id: string;
  panel_id: string;
  image_path: string | null;
  inspection_at: string;
  prediction: string | null;
  confidence: number | null;
  is_fault: boolean;
  processing_status: ProcessingStatus;
  error_message: string | null;
  notification_status: NotificationStatus;
  trigger_type: TriggerType;
  raw_output: Record<string, unknown> | null;
  created_at: string;
}

export interface InspectionSchedule {
  id: string;
  panel_id: string;
  days_of_week: number[];
  inspection_time: string;
  camera_device: string;
  is_active: boolean;
  updated_at: string;
}

export interface DashboardStats {
  total: number;
  normal: number;
  faults: number;
  latest: Inspection | null;
}

export interface ModelPrediction {
  class: string;
  confidence: number;
  is_fault: boolean;
  all_classes?: { class: string; confidence: number }[];
}

export interface InspectionCreate {
  panel_id: string;
  image_path: string | null;
  inspection_at: string;
  trigger_type: TriggerType;
}

export interface InspectionUpdate {
  prediction?: string;
  confidence?: number;
  is_fault?: boolean;
  processing_status?: ProcessingStatus;
  error_message?: string | null;
  notification_status?: NotificationStatus;
  raw_output?: Record<string, unknown> | null;
}
