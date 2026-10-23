import type { AlertSeverity, AlertType, PowerMode, Sensor, SensorStatus } from '@wx/shared';
import {
  BatteryFull,
  BatteryLow,
  BatteryWarning,
  CircleCheck,
  CircleDashed,
  CircleOff,
  CirclePause,
  type LucideIcon,
  Moon,
  OctagonAlert,
  TriangleAlert,
  Unplug,
  Wifi,
  WifiOff,
} from 'lucide-react';
import type { StationStatus } from '../../common/api';

/** Status tone: maps to the reserved status colours, or neutral ink. */
export type Tone = 'good' | 'warning' | 'serious' | 'critical' | 'neutral';

export interface StatusLook {
  label: string;
  icon: LucideIcon;
  tone: Tone;
}

export function stationStatusLook(
  status: StationStatus,
  severity: AlertSeverity | null,
): StatusLook {
  switch (status) {
    case 'online':
      return { label: 'Online', icon: Wifi, tone: 'good' };
    case 'sleeping':
      return { label: 'Dormindo', icon: Moon, tone: 'neutral' };
    case 'offline':
      return { label: 'Offline', icon: WifiOff, tone: 'serious' };
    case 'no_contact':
      return {
        label: 'Sem contato',
        icon: severity === 'critical' ? OctagonAlert : TriangleAlert,
        tone: severity === 'critical' ? 'critical' : 'warning',
      };
    case 'inactive':
      return { label: 'Desativada', icon: CirclePause, tone: 'neutral' };
    default:
      return { label: 'Nunca conectou', icon: CircleDashed, tone: 'neutral' };
  }
}

export const POWER_MODE_LOOK: Record<PowerMode, StatusLook & { description: string }> = {
  normal: {
    label: 'Normal',
    icon: BatteryFull,
    tone: 'good',
    description: 'Wi-Fi conectado, uma leitura por minuto',
  },
  economy: {
    label: 'Economia',
    icon: BatteryLow,
    tone: 'warning',
    description: 'Envia as leituras em lote a cada poucos minutos',
  },
  survival: {
    label: 'Sobrevivência',
    icon: BatteryWarning,
    tone: 'critical',
    description: 'Dorme quase o tempo todo; vento e chuva não são medidos',
  },
};

export const SENSOR_NAMES: Record<Sensor, string> = {
  bme280: 'BME280',
  htu21d: 'HTU21D',
  anemometer: 'Anemômetro',
  rain_gauge: 'Pluviômetro',
  battery: 'Bateria',
};

export const SENSOR_STATUS_LOOK: Record<SensorStatus, StatusLook> = {
  ok: { label: 'Funcionando', icon: CircleCheck, tone: 'good' },
  stale: { label: 'Sem dados', icon: TriangleAlert, tone: 'warning' },
  error: { label: 'Com falha', icon: OctagonAlert, tone: 'critical' },
  not_measured: { label: 'Não medido', icon: Moon, tone: 'neutral' },
  disabled: { label: 'Não instalado', icon: CircleOff, tone: 'neutral' },
  unknown: { label: 'Aguardando', icon: CircleDashed, tone: 'neutral' },
};

export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  station_offline: 'Estação sem contato',
  sensor_stale: 'Sensor sem dados',
  sensor_error: 'Falha de sensor',
  battery_low: 'Bateria baixa',
  battery_critical: 'Bateria crítica',
  data_dropped: 'Leituras descartadas',
  collector_down: 'Coletor parado',
};

export const SEVERITY_LOOK: Record<AlertSeverity, StatusLook> = {
  info: { label: 'Informação', icon: CircleCheck, tone: 'neutral' },
  warning: { label: 'Atenção', icon: TriangleAlert, tone: 'warning' },
  critical: { label: 'Crítico', icon: OctagonAlert, tone: 'critical' },
};

export const UNPLUGGED_ICON = Unplug;

/** Tailwind text colour for a tone. */
export const TONE_TEXT: Record<Tone, string> = {
  good: 'text-good',
  warning: 'text-warning',
  serious: 'text-serious',
  critical: 'text-critical',
  neutral: 'text-ink-2',
};

/** RSSI (dBm) in words. */
export function signalQuality(rssi: number | null): string {
  if (rssi === null) return 'Sem dado';
  if (rssi >= -60) return 'Ótimo';
  if (rssi >= -70) return 'Bom';
  if (rssi >= -80) return 'Fraco';
  return 'Muito fraco';
}
