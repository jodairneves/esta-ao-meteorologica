import {
  type AlertSeverity,
  type ClimateSensor,
  type ConnectionState,
  isClimateSensor,
  type MonitoringSettings,
  type PowerMode,
  type Sensor,
  type SensorStatus,
} from '@wx/shared';

// Pure rules of the monitor (design §7.4).

export interface ContactInput {
  connection: ConnectionState;
  lastSeenAt: Date | null;
  nextContactAt: Date | null;
  powerMode: PowerMode | null;
  intervalS: number;
  economyBatchS: number;
  survivalSleepS: number;
}

/** How often the station is expected to talk, given its power profile. */
export function expectedContactIntervalS(input: ContactInput): number {
  switch (input.powerMode) {
    case 'economy':
      return input.economyBatchS;
    case 'survival':
      return input.survivalSleepS;
    default:
      return input.intervalS;
  }
}

/** Moment after which the station counts as overdue; null if it never talked to us. */
export function contactDeadline(input: ContactInput, settings: MonitoringSettings): Date | null {
  if (input.connection === 'sleeping' && input.nextContactAt) {
    const graceS = Math.max(120, input.economyBatchS / 2);
    return new Date(input.nextContactAt.getTime() + graceS * 1000);
  }
  if (!input.lastSeenAt) return null;
  const windowS = Math.max(
    settings.offlineAfterIntervals * expectedContactIntervalS(input),
    settings.offlineMinSeconds,
  );
  return new Date(input.lastSeenAt.getTime() + windowS * 1000);
}

export type ContactEvaluation =
  | { status: 'never_seen' }
  | { status: 'ok'; deadline: Date }
  | { status: 'overdue'; deadline: Date; overdueS: number; severity: AlertSeverity };

export function evaluateContact(
  input: ContactInput,
  settings: MonitoringSettings,
  now: Date,
): ContactEvaluation {
  const deadline = contactDeadline(input, settings);
  if (!deadline) return { status: 'never_seen' };
  const overdueS = (now.getTime() - deadline.getTime()) / 1000;
  if (overdueS <= 0) return { status: 'ok', deadline };
  return {
    status: 'overdue',
    deadline,
    overdueS,
    severity: overdueS >= settings.offlineCriticalAfterSeconds ? 'critical' : 'warning',
  };
}

/**
 * Sensors the station is supposed to report in its current profile (battery comes via health).
 * Only the climate sensor of the station's version counts; in survival it is the only one.
 */
export function isSensorExpected(
  sensor: Sensor,
  powerMode: PowerMode | null,
  climateSensor: ClimateSensor,
): boolean {
  if (sensor === 'battery') return false;
  if (isClimateSensor(sensor)) return sensor === climateSensor;
  return powerMode !== 'survival';
}

export function sensorStaleAfterS(input: ContactInput, settings: MonitoringSettings): number {
  return Math.max(
    settings.sensorStaleAfterIntervals * expectedContactIntervalS(input),
    settings.sensorStaleMinSeconds,
  );
}

export interface SensorSnapshot {
  sensor: Sensor;
  status: SensorStatus;
  lastValueAt: Date | null;
}

/** Sensors that used to deliver data and stopped. Only evaluated for stations in contact. */
export function findStaleSensors(
  sensors: readonly SensorSnapshot[],
  input: ContactInput,
  climateSensor: ClimateSensor,
  settings: MonitoringSettings,
  now: Date,
): Sensor[] {
  const limitMs = sensorStaleAfterS(input, settings) * 1000;
  return sensors
    .filter(
      (s) =>
        s.status === 'ok' &&
        s.lastValueAt !== null &&
        isSensorExpected(s.sensor, input.powerMode, climateSensor) &&
        now.getTime() - s.lastValueAt.getTime() > limitMs,
    )
    .map((s) => s.sensor);
}
