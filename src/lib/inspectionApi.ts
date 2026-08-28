import { supabase } from './supabase';
import { runInference } from './modelAdapter';
import { decideCleaning } from './cleaningDecision';
import { getInspectionWeather } from './weatherApi';
import type {
  Inspection,
  InspectionSchedule,
  InspectionCreate,
  InspectionUpdate,
  DashboardStats,
  ModelPrediction,
} from '@/types';

/**
 * Inspection API Service
 * ----------------------
 * All database operations for inspections and schedules.
 * The frontend calls these functions; they talk to Supabase directly.
 */

export async function createInspection(input: InspectionCreate): Promise<Inspection> {
  const { data, error } = await supabase
    .from('inspections')
    .insert({
      panel_id: input.panel_id,
      image_path: input.image_path,
      inspection_at: input.inspection_at,
      trigger_type: input.trigger_type,
      processing_status: 'pending',
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create inspection record: ${error.message}`);
  return data as Inspection;
}

export async function updateInspection(id: string, update: InspectionUpdate): Promise<Inspection> {
  const { data, error } = await supabase
    .from('inspections')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update inspection: ${error.message}`);
  return data as Inspection;
}

export async function getLatestInspection(panelId?: string): Promise<Inspection | null> {
  let query = supabase
    .from('inspections')
    .select('*')
    .order('inspection_at', { ascending: false })
    .limit(1);

  if (panelId) query = query.eq('panel_id', panelId);

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`Failed to fetch latest inspection: ${error.message}`);
  return data as Inspection | null;
}

export async function getInspectionHistory(limit = 50, panelId?: string): Promise<Inspection[]> {
  let query = supabase
    .from('inspections')
    .select('*')
    .order('inspection_at', { ascending: false })
    .limit(limit);

  if (panelId) query = query.eq('panel_id', panelId);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch inspection history: ${error.message}`);
  return (data as Inspection[]) ?? [];
}

export async function getInspectionById(id: string): Promise<Inspection | null> {
  const { data, error } = await supabase
    .from('inspections')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch inspection: ${error.message}`);
  return data as Inspection | null;
}

export async function getDashboardStats(panelId?: string): Promise<DashboardStats> {
  let query = supabase.from('inspections').select('is_fault, processing_status');
  if (panelId) query = query.eq('panel_id', panelId);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch dashboard stats: ${error.message}`);

  const rows = data as Inspection[] ?? [];
  const total = rows.length;
  const faults = rows.filter((r) => r.is_fault).length;
  const normal = total - faults;
  const latest = await getLatestInspection(panelId);

  return { total, normal, faults, latest };
}

/**
 * Run the full inspection pipeline:
 * 1. Create inspection record (status: pending)
 * 2. Capture browser GPS and Open-Meteo weather context
 * 3. Send image and weather context to model adapter
 * 4. Combine the AI result with weather into a cleaning decision
 * 5. Update record with prediction (status: completed)
 * 6. If fault detected, mark notification as needed
 *
 * Returns the completed inspection record.
 */
export async function runInspection(
  panelId: string,
  imageBlob: Blob,
  triggerType: 'manual' | 'scheduled' = 'manual'
): Promise<Inspection> {
  // Step 1: Convert image to data URL for storage
  const imageDataUrl = await blobToDataUrl(imageBlob);

  // Step 2: Create inspection record
  const inspection = await createInspection({
    panel_id: panelId,
    image_path: imageDataUrl,
    inspection_at: new Date().toISOString(),
    trigger_type: triggerType,
  });

  // Step 3: Mark as processing
  await updateInspection(inspection.id, { processing_status: 'processing' });

  // Step 4: Capture weather context before AI inference
  const weather = await getInspectionWeather();

  // Step 5: Run model inference
  let prediction: ModelPrediction;
  try {
    prediction = await runInference(imageBlob, weather);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown inference error';
    const updated = await updateInspection(inspection.id, {
      processing_status: 'failed',
      error_message: errorMsg,
      notification_status: 'not_required',
      raw_output: {
        weather,
      },
    });
    return updated;
  }

  const cleaningDecision = decideCleaning(prediction, weather);

  // Step 6: Update record with prediction
  const updated = await updateInspection(inspection.id, {
    prediction: prediction.class,
    confidence: prediction.confidence,
    is_fault: prediction.is_fault,
    processing_status: 'completed',
    error_message: null,
    notification_status: prediction.is_fault ? 'sent' : 'not_required',
    raw_output: {
      model: prediction,
      weather,
      cleaning_decision: cleaningDecision,
      raw_model_response: prediction.raw_response,
      ...prediction,
    } as Record<string, unknown>,
  });

  return updated;
}

// --- Schedule ---

export async function getSchedule(panelId?: string): Promise<InspectionSchedule | null> {
  let query = supabase.from('inspection_schedule').select('*');
  if (panelId) query = query.eq('panel_id', panelId);

  const { data, error } = await query.order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`Failed to fetch schedule: ${error.message}`);
  return data as InspectionSchedule | null;
}

export async function upsertSchedule(schedule: Omit<InspectionSchedule, 'id' | 'updated_at'> & { id?: string }): Promise<InspectionSchedule> {
  const payload = {
    panel_id: schedule.panel_id,
    days_of_week: schedule.days_of_week,
    inspection_time: schedule.inspection_time,
    camera_device: schedule.camera_device,
    is_active: schedule.is_active,
    updated_at: new Date().toISOString(),
  };

  if (schedule.id) {
    const { data, error } = await supabase
      .from('inspection_schedule')
      .update(payload)
      .eq('id', schedule.id)
      .select()
      .single();
    if (error) throw new Error(`Failed to update schedule: ${error.message}`);
    return data as InspectionSchedule;
  }

  const { data, error } = await supabase
    .from('inspection_schedule')
    .insert(payload)
    .select()
    .single();
  if (error) throw new Error(`Failed to create schedule: ${error.message}`);
  return data as InspectionSchedule;
}

// --- Helpers ---

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to convert image for storage.'));
    reader.readAsDataURL(blob);
  });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAY_FULL_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
