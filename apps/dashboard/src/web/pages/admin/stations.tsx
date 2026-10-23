import { Pencil, Plus, RadioTower } from 'lucide-react';
import { Link } from 'react-router';
import { useStations } from '../../api/queries';
import { EmptyState, ErrorNotice, PageHeader } from '../../components/ui/misc';
import { StatusPill } from '../../components/ui/status';
import { formatNumber, formatRelative } from '../../lib/format';
import { usePageTitle } from '../../lib/page-title';
import { stationStatusLook } from '../../lib/status';
import { useNow } from '../../lib/time';

export default function AdminStationsPage() {
  usePageTitle('Cadastro de estações');
  const stations = useStations();
  const now = useNow();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Cadastro de estações"
        description="Dados, localização, calibração, configuração remota e credenciais MQTT de cada estação."
        actions={
          <Link
            to="/admin/estacoes/nova"
            className="inline-flex h-9 items-center gap-2 rounded-md bg-ink px-3.5 text-sm font-medium text-canvas hover:bg-ink/90"
          >
            <Plus aria-hidden className="size-4" />
            Nova estação
          </Link>
        }
      />
      {stations.isError && <ErrorNotice error={stations.error} />}
      {stations.isSuccess && stations.data.length === 0 && (
        <section className="panel">
          <EmptyState icon={RadioTower} title="Nenhuma estação cadastrada">
            Cadastre a primeira estação para gerar as credenciais MQTT do D1 mini.
          </EmptyState>
        </section>
      )}
      {stations.data && stations.data.length > 0 && (
        <section className="panel overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-left text-[13px] text-ink-2">
              <tr className="border-b border-hairline">
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Estação
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Código
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Situação
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Localização
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Último contato
                </th>
                <th scope="col" className="px-4 py-2.5">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {stations.data.map((station) => (
                <tr key={station.id} className="border-b border-hairline last:border-0">
                  <th scope="row" className="px-4 py-3 text-left font-medium text-ink">
                    {station.name}
                  </th>
                  <td className="dense px-4 py-3 text-ink-2">{station.code}</td>
                  <td className="px-4 py-3">
                    <StatusPill look={stationStatusLook(station.status, station.statusSeverity)} />
                  </td>
                  <td className="px-4 py-3 text-ink-2">
                    {station.latitude === null || station.longitude === null
                      ? 'Não informada'
                      : `${formatNumber(station.latitude, 4)}, ${formatNumber(station.longitude, 4)}`}
                  </td>
                  <td className="px-4 py-3 text-ink-2">
                    {station.state.lastSeenAt
                      ? formatRelative(station.state.lastSeenAt, now)
                      : 'Nunca'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to={`/admin/estacoes/${station.code}`}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium text-ink-2 hover:bg-raised hover:text-ink"
                    >
                      <Pencil aria-hidden className="size-4" />
                      Editar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
