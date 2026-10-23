import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { CreateStationResponse } from '../../../common/api';
import { api } from '../../api/client';
import { keys } from '../../api/queries';
import { CredentialsCard } from '../../components/admin/credentials-card';
import { initialStationValues, StationForm } from '../../components/admin/station-form';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { PageHeader } from '../../components/ui/misc';
import { usePageTitle } from '../../lib/page-title';

export default function NewStationPage() {
  usePageTitle('Nova estação');
  const client = useQueryClient();
  const navigate = useNavigate();
  const [created, setCreated] = useState<CreateStationResponse | null>(null);

  const finish = () => {
    if (created) navigate(`/admin/estacoes/${created.station.code}`, { replace: true });
  };

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link
        to="/admin/estacoes"
        className="inline-flex items-center gap-1.5 self-start text-[13px] text-ink-2 hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Cadastro de estações
      </Link>
      <PageHeader
        title="Nova estação"
        description="Ao salvar, o sistema cria o usuário MQTT da estação e mostra a senha uma única vez."
      />
      <section className="panel px-5 py-5">
        <StationForm
          initial={initialStationValues()}
          isNew
          submitLabel="Cadastrar estação"
          onSubmit={async (body) => {
            const response = await api.post<CreateStationResponse>('/stations', body);
            client.invalidateQueries({ queryKey: keys.stations });
            setCreated(response);
          }}
        />
      </section>

      <Dialog
        open={created !== null}
        onOpenChange={(open) => !open && finish()}
        title={`${created?.station.name ?? 'Estação'} cadastrada`}
        description="Use estes dados no portal de configuração do D1 mini."
        footer={
          <Button variant="primary" onClick={finish}>
            Anotei, continuar
          </Button>
        }
      >
        {created && <CredentialsCard credentials={created.credentials} />}
      </Dialog>
    </div>
  );
}
