import { useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  ChartSpline,
  Cpu,
  Gauge,
  LogOut,
  type LucideIcon,
  Menu,
  Moon,
  Radio,
  RadioTower,
  ScrollText,
  Settings2,
  Sun,
  UserRound,
  Users,
  WifiOff,
  X,
} from 'lucide-react';
import { Dialog as DialogPrimitive, DropdownMenu } from 'radix-ui';
import { type ReactNode, useEffect, useState } from 'react';
import {
  NavLink,
  Outlet,
  ScrollRestoration,
  useLocation,
  useNavigate,
  useNavigation,
} from 'react-router';
import { api } from '../api/client';
import { useStations, useSystemStatus } from '../api/queries';
import { useLiveStream } from '../api/stream';
import { cn } from '../lib/css';
import { stationStatusLook, TONE_TEXT } from '../lib/status';
import { useTheme } from '../lib/theme';
import { BrandMark, BrandName } from './brand';
import { useIsAdmin, useUser } from './session';

function NavItem({
  to,
  icon: Icon,
  children,
  end,
  badge,
}: {
  to: string;
  icon: LucideIcon;
  children: ReactNode;
  end?: boolean;
  badge?: ReactNode;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors',
          isActive
            ? 'bg-raised font-medium text-ink'
            : 'text-ink-2 hover:bg-raised/60 hover:text-ink',
        )
      }
    >
      <Icon aria-hidden className="size-[18px] shrink-0" strokeWidth={1.75} />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {badge}
    </NavLink>
  );
}

function NavGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-5">
      <h2 className="mb-1 px-2.5 text-[13px] text-ink-3">{label}</h2>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

/** Station shortcuts: the status icon carries the state, the name stays in ink. */
function StationLinks() {
  const stations = useStations();
  if (!stations.data?.length) return null;
  return (
    <NavGroup label="Estações">
      {stations.data
        .filter((station) => station.isActive)
        .map((station) => {
          const look = stationStatusLook(station.status, station.statusSeverity);
          const Icon = look.icon;
          return (
            <NavLink
              key={station.id}
              to={`/estacoes/${station.code}`}
              className={({ isActive }) =>
                cn(
                  'flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors',
                  isActive
                    ? 'bg-raised font-medium text-ink'
                    : 'text-ink-2 hover:bg-raised/60 hover:text-ink',
                )
              }
            >
              <Icon
                aria-label={look.label}
                className={cn('size-4 shrink-0', TONE_TEXT[look.tone])}
              />
              <span className="min-w-0 flex-1 truncate">{station.name}</span>
            </NavLink>
          );
        })}
    </NavGroup>
  );
}

function AlertBadge() {
  const status = useSystemStatus();
  const active = status.data?.alerts.active ?? 0;
  if (!active) return null;
  const critical = (status.data?.alerts.critical ?? 0) > 0;
  return (
    <span
      className={cn(
        'min-w-5 rounded-full px-1.5 text-center text-xs leading-5 font-semibold tabular-nums',
        critical ? 'bg-critical text-white' : 'bg-warning text-black',
      )}
    >
      <span className="sr-only">
        {critical ? 'Alertas ativos, há críticos: ' : 'Alertas ativos: '}
      </span>
      {active}
    </span>
  );
}

function Navigation() {
  const isAdmin = useIsAdmin();
  return (
    <nav aria-label="Principal" className="flex flex-col">
      <div className="flex flex-col gap-0.5">
        <NavItem to="/" icon={Gauge} end>
          Visão geral
        </NavItem>
        <NavItem to="/comparar" icon={ChartSpline}>
          Comparar estações
        </NavItem>
        <NavItem to="/dispositivos" icon={Cpu}>
          Dispositivos
        </NavItem>
        <NavItem to="/alertas" icon={Bell} badge={<AlertBadge />}>
          Alertas
        </NavItem>
        <NavItem to="/logs" icon={ScrollText}>
          Logs
        </NavItem>
      </div>
      <StationLinks />
      {isAdmin && (
        <NavGroup label="Administração">
          <NavItem to="/admin/estacoes" icon={RadioTower}>
            Cadastro de estações
          </NavItem>
          <NavItem to="/admin/usuarios" icon={Users}>
            Usuários
          </NavItem>
          <NavItem to="/admin/configuracoes" icon={Settings2}>
            Configurações
          </NavItem>
        </NavGroup>
      )}
    </nav>
  );
}

function LiveIndicator({ connected }: { connected: boolean }) {
  return connected ? (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-2">
      <Radio aria-hidden className="size-4 text-good" />
      Ao vivo
    </span>
  ) : (
    <span
      className="inline-flex items-center gap-1.5 text-[13px] text-ink-2"
      title="Tentando reconectar"
    >
      <WifiOff aria-hidden className="size-4 text-warning" />
      Reconectando
    </span>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return `${parts[0]?.[0] ?? ''}${parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : ''}`.toUpperCase();
}

function UserMenu() {
  const user = useUser();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const client = useQueryClient();

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      client.clear();
      navigate('/login', { replace: true });
    }
  };

  const item =
    'flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-sm text-ink outline-none data-[highlighted]:bg-panel';

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label={`Menu da conta de ${user.name}`}
        className="flex w-full items-center gap-2.5 rounded-md p-1.5 text-left hover:bg-raised/60 data-[state=open]:bg-raised"
      >
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-full bg-raised text-xs font-semibold text-ink-2"
        >
          {initials(user.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink">{user.name}</span>
          <span className="block truncate text-[13px] text-ink-3">
            {user.role === 'admin' ? 'Administrador' : 'Operador'}
          </span>
        </span>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="top"
          align="start"
          sideOffset={6}
          className="panel z-50 w-[var(--radix-dropdown-menu-trigger-width)] min-w-56 bg-raised p-1"
        >
          <DropdownMenu.Label className="truncate px-2.5 py-1.5 text-[13px] text-ink-3">
            {user.email}
          </DropdownMenu.Label>
          <DropdownMenu.Item className={item} onSelect={() => navigate('/perfil')}>
            <UserRound aria-hidden className="size-4 text-ink-2" />
            Meu perfil
          </DropdownMenu.Item>
          <DropdownMenu.Item className={item} onSelect={toggle}>
            {theme === 'dark' ? (
              <Sun aria-hidden className="size-4 text-ink-2" />
            ) : (
              <Moon aria-hidden className="size-4 text-ink-2" />
            )}
            {theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-hairline" />
          <DropdownMenu.Item className={item} onSelect={logout}>
            <LogOut aria-hidden className="size-4 text-ink-2" />
            Sair
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function SidebarContent({ connected }: { connected: boolean }) {
  return (
    <div className="flex h-full flex-col">
      <NavLink to="/" className="flex items-center gap-2.5 px-2.5 pt-1 pb-5 text-ink">
        <BrandMark className="size-7" />
        <BrandName className="text-[15px]" />
      </NavLink>
      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
        <Navigation />
      </div>
      <div className="mt-4 flex flex-col gap-2 border-t border-hairline pt-3">
        <div className="px-2.5">
          <LiveIndicator connected={connected} />
        </div>
        <UserMenu />
      </div>
    </div>
  );
}

function NavigationProgress() {
  const navigation = useNavigation();
  if (navigation.state === 'idle') return null;
  return (
    <div
      role="progressbar"
      aria-label="Carregando"
      className="fixed inset-x-0 top-0 z-[70] h-0.5 overflow-hidden"
    >
      <div className="h-full w-1/3 animate-[wx-progress_1s_ease-in-out_infinite] bg-ink-2" />
    </div>
  );
}

export function AppShell() {
  const connected = useLiveStream(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  // The mobile drawer closes once a link inside it is followed.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on navigation
  useEffect(() => setDrawerOpen(false), [location.pathname]);

  return (
    <div className="lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <NavigationProgress />
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[80] focus:rounded-md focus:bg-raised focus:px-3 focus:py-2"
      >
        Pular para o conteúdo
      </a>

      <aside className="sticky top-0 hidden h-dvh border-r border-hairline bg-panel/40 px-3 py-4 lg:block">
        <SidebarContent connected={connected} />
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-hairline bg-canvas/90 px-4 backdrop-blur lg:hidden">
        <DialogPrimitive.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
          <DialogPrimitive.Trigger
            aria-label="Abrir menu"
            className="-ml-1.5 inline-flex size-9 items-center justify-center rounded-md text-ink-2 hover:bg-raised hover:text-ink"
          >
            <Menu aria-hidden className="size-5" />
          </DialogPrimitive.Trigger>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/60" />
            <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 w-[min(300px,85vw)] border-r border-hairline bg-panel px-3 py-4">
              <DialogPrimitive.Title className="sr-only">Menu</DialogPrimitive.Title>
              <DialogPrimitive.Description className="sr-only">
                Navegação principal
              </DialogPrimitive.Description>
              <DialogPrimitive.Close
                aria-label="Fechar menu"
                className="absolute top-3 right-3 rounded-md p-1.5 text-ink-3 hover:bg-raised hover:text-ink"
              >
                <X aria-hidden className="size-5" />
              </DialogPrimitive.Close>
              <SidebarContent connected={connected} />
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
        <NavLink to="/" className="flex items-center gap-2 text-ink">
          <BrandMark className="size-6" />
          <span className="heading text-[15px]">Estação Meteorológica</span>
        </NavLink>
        <div className="ml-auto">
          <LiveIndicator connected={connected} />
        </div>
      </header>

      <main
        id="conteudo"
        className="mx-auto w-full max-w-[1480px] min-w-0 px-4 pt-6 pb-16 sm:px-6 lg:px-8 lg:pt-8"
      >
        <Outlet />
      </main>
      <ScrollRestoration />
    </div>
  );
}
