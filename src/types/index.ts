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
  cleaning: number;
  damage: number;
  latest: Inspection | null;
}

export interface ModelPrediction {
  class: string;
  confidence: number;
  is_fault: boolean;
  all_classes?: { class: string; confidence: number }[];
  gradcam_image?: string | null;
  gradcam_error?: string | null;
  raw_response?: Record<string, unknown>;
}

export interface WeatherSnapshot {
  latitude: number;
  longitude: number;
  source: 'open-meteo';
  captured_at: string;
  temperature_c: number | null;
  humidity_pct: number | null;
  precipitation_mm: number | null;
  rain_mm: number | null;
  showers_mm: number | null;
  wind_speed_kmh: number | null;
  wind_gusts_kmh: number | null;
  weather_code: number | null;
  cloud_cover_pct: number | null;
  forecast_24h_precipitation_mm: number | null;
  forecast_24h_precipitation_probability_max_pct: number | null;
  error?: string;
}

export type CleaningDecisionAction = 'clean_now' | 'defer_for_rain' | 'monitor' | 'maintenance_review';

export interface CleaningDecision {
  action: CleaningDecisionAction;
  label: string;
  reason: string;
  priority: 'low' | 'medium' | 'high';
  should_clean: boolean;
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
