import type { SensorDto } from '../../../common/api';
import { formatRelative } from '../../lib/format';
import { SENSOR_NAMES, SENSOR_STATUS_LOOK } from '../../lib/status';
import { useNow } from '../../lib/time';
import { StatusPill } from '../ui/status';

/** Each sensor's own state: a station can be online with a silent anemometer. */
export function SensorStrip({ sensors }: { sensors: SensorDto[] }) {
  const now = useNow();
  return (
    <ul className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
      {sensors.map((sensor) => (
        <li key={sensor.sensor} className="min-w-0">
          <p className="text-sm text-ink">{SENSOR_NAMES[sensor.sensor]}</p>
          <StatusPill look={SENSOR_STATUS_LOOK[sensor.status]} />
          <p className="truncate text-[13px] text-ink-3" title={sensor.detail ?? undefined}>
            {sensor.lastValueAt
              ? `Último dado ${formatRelative(sensor.lastValueAt, now)}`
              : 'Nenhum dado ainda'}
          </p>
        </li>
      ))}
    </ul>
  );
}
