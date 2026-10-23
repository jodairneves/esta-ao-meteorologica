import { useEffect } from 'react';

const APP_NAME = 'Estação Meteorológica';

/** Browser tab title: the screen first, then the product. */
export function usePageTitle(title: string | null | undefined): void {
  useEffect(() => {
    document.title = title ? `${title} | ${APP_NAME}` : APP_NAME;
  }, [title]);
}
