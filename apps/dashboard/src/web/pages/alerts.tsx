import { useInfiniteQuery } from '@tanstack/react-query';
import { BellOff } from 'lucide-react';
import { useSearchParams } from 'react-router';
import type { AlertDto, Page } from '../../common/api';
import { api, query } from '../api/client';
import { AlertList } from '../components/alert-list';
import { Button } from '../components/ui/button';
import { EmptyState, ErrorNotice, PageHeader } from '../components/ui/misc';
import { Segmented } from '../components/ui/segmented';
import { usePageTitle } from '../lib/page-title';

const TABS = [
  { value: 'active', label: 'Ativos' },
  { value: 'resolved', label: 'Resolvidos' },
  { value: 'all', label: 'Todos' },
] as const;
type Tab = (typeof TABS)[number]['value'];

const EMPTY: Record<Tab, string> = {
  active: 'Nenhum alerta ativo. Todas as estações estão dentro do esperado.',
  resolved: 'Nenhum alerta resolvido ainda.',
  all: 'Nenhum alerta registrado ainda.',
};

export default function AlertsPage() {
  usePageTitle('Alertas');
  const [search, setSearch] = useSearchParams();
  const tab: Tab = TABS.some((item) => item.value === search.get('situacao'))
    ? (search.get('situacao') as Tab)
    : 'active';

  const pages = useInfiniteQuery({
    queryKey: ['alerts', tab, 'pages'],
    queryFn: ({ pageParam }) =>
      api.get<Page<AlertDto>>(
        `/alerts${query({ status: tab, limit: 50, cursor: pageParam ?? undefined })}`,
      ),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const alerts = pages.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Alertas"
        description="Situações que pedem atenção: estação sem contato, sensor sem dados, bateria baixa, coletor parado."
      />
      <Segmented
        label="Situação dos alertas"
        value={tab}
        options={TABS}
        onChange={(value) => setSearch({ situacao: value }, { replace: true })}
        className="self-start"
      />
      {pages.isError && <ErrorNotice error={pages.error} />}
      <section className="panel">
        {pages.isPending && <div className="h-48 animate-pulse" />}
        {pages.isSuccess && alerts.length === 0 && <EmptyState icon={BellOff} title={EMPTY[tab]} />}
        {alerts.length > 0 && <AlertList alerts={alerts} />}
      </section>
      {pages.hasNextPage && (
        <Button
          className="self-center"
          loading={pages.isFetchingNextPage}
          onClick={() => pages.fetchNextPage()}
        >
          Carregar mais
        </Button>
      )}
    </div>
  );
}
