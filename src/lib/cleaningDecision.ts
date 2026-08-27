import type { CleaningDecision, ModelPrediction, WeatherSnapshot } from '@/types';

const SOILING_TERMS = ['dust', 'dirt', 'dirty', 'soiling', 'soil', 'bird', 'debris', 'ash', 'sand'];

export function decideCleaning(
  prediction: ModelPrediction,
  weather: WeatherSnapshot | null
): CleaningDecision {
  const predictedClass = prediction.class.toLowerCase();
  const looksLikeSoiling = SOILING_TERMS.some((term) => predictedClass.includes(term));
  const rainNow = (weather?.precipitation_mm ?? 0) > 0 || (weather?.rain_mm ?? 0) > 0 || (weather?.showers_mm ?? 0) > 0;
  const usefulRainSoon = (weather?.forecast_24h_precipitation_mm ?? 0) >= 2;
  const likelyRainSoon = (weather?.forecast_24h_precipitation_probability_max_pct ?? 0) >= 60;

  if (!prediction.is_fault) {
    return {
      action: 'monitor',
      label: 'No cleaning needed',
      reason: 'The AI result is normal, so cleaning is not recommended from this inspection.',
      priority: 'low',
      should_clean: false,
    };
  }

  if (!looksLikeSoiling) {
    return {
      action: 'maintenance_review',
      label: 'Maintenance review',
      reason: `The AI detected ${prediction.class}. This looks like a panel fault rather than a cleaning issue.`,
      priority: 'high',
      should_clean: false,
    };
  }

  if (rainNow) {
    return {
      action: 'defer_for_rain',
      label: 'Wait for weather',
      reason: 'Rain is already detected at the panel location, so manual cleaning can be deferred and rechecked later.',
      priority: 'medium',
      should_clean: false,
    };
  }

  if (usefulRainSoon || likelyRainSoon) {
    return {
      action: 'defer_for_rain',
      label: 'Defer cleaning',
      reason: 'Rain is likely within 24 hours, so let weather clean loose dust before scheduling manual work.',
      priority: 'medium',
      should_clean: false,
    };
  }

  return {
    action: 'clean_now',
    label: 'Clean panel',
    reason: `The AI detected ${prediction.class}, and local weather does not show enough rain to clean it soon.`,
    priority: 'high',
    should_clean: true,
  };
}
