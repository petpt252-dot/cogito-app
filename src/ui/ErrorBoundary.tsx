import { Component, type ReactNode } from 'react';

const TEXT = {
  en: { title: 'Something went wrong', body: 'Your training is saved: finished blocks are kept, and an interrupted session can be resumed.', reload: 'Reload the app' },
  pt: { title: 'Algo correu mal', body: 'O seu treino está guardado: os blocos acabados ficam, e uma sessão interrompida pode ser retomada.', reload: 'Recarregar a app' },
};

/** Last resort: an error while rendering shows a way back instead of a blank page. Outside the i18n provider on purpose. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    const t = document.documentElement.lang.startsWith('pt') ? TEXT.pt : TEXT.en;
    return (
      <div className="flex min-h-screen items-center justify-center bg-void p-6 text-center">
        <div className="max-w-md rounded-2xl border border-line bg-panel p-6">
          <h1 className="text-xl font-semibold text-white">{t.title}</h1>
          <p className="mt-2 text-sm text-ink">{t.body}</p>
          <button type="button" onClick={() => location.reload()} className="mt-4 rounded-xl border border-volt px-5 py-2 font-semibold text-white hover:bg-volt/20">
            {t.reload}
          </button>
        </div>
      </div>
    );
  }
}
