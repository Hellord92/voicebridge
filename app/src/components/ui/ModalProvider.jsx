import React, { createContext, useCallback, useContext, useState } from 'react';

const ModalContext = createContext(null);

export function ModalProvider({ children }) {
  const [modal, setModal] = useState(null);
  const [toasts, setToasts] = useState([]);

  const closeModal = useCallback(() => setModal(null), []);

  const showModal = useCallback((config) => {
    return new Promise((resolve) => {
      setModal({
        ...config,
        onClose: (result) => {
          setModal(null);
          resolve(result);
        },
      });
    });
  }, []);

  const alert = useCallback((opts) => {
    const title = typeof opts === 'string' ? opts : opts.title;
    const message = typeof opts === 'string' ? '' : (opts.message || '');
    const detail = typeof opts === 'string' ? '' : (opts.detail || '');
    return showModal({
      type: 'alert',
      title,
      message,
      detail,
      variant: opts.variant || 'info',
      actions: [{ label: 'OK', primary: true, value: true }],
    });
  }, [showModal]);

  const confirm = useCallback((opts) => {
    return showModal({
      type: 'confirm',
      title: opts.title,
      message: opts.message,
      detail: opts.detail,
      variant: opts.variant || 'warning',
      blocking: opts.blocking,
      actions: [
        { label: opts.cancelLabel || 'Cancel', value: false },
        { label: opts.confirmLabel || 'OK', primary: true, value: true },
      ],
    });
  }, [showModal]);

  const toast = useCallback((message, variant = 'info', duration = 4000) => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, message, variant }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), duration);
  }, []);

  return (
    <ModalContext.Provider value={{ showModal, alert, confirm, toast, closeModal }}>
      {children}
      {modal && <ModalShell {...modal} />}
      <ToastStack toasts={toasts} />
    </ModalContext.Provider>
  );
}

export function useModal() {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error('useModal must be used within ModalProvider');
  return ctx;
}

function ModalShell({ title, message, detail, variant, actions, blocking, onClose }) {
  const variantStyles = {
    info:    'border-cyan-500/30',
    warning: 'border-amber-500/40',
    error:   'border-rose-500/40',
    success: 'border-emerald-500/40',
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
      onClick={blocking ? undefined : () => onClose(false)}
    >
      <div
        className={`w-full max-w-sm rounded-2xl border bg-[#0f0f18] p-6 shadow-2xl ${variantStyles[variant] || variantStyles.info}`}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {title && <h2 className="text-lg font-semibold text-white mb-2">{title}</h2>}
        {message && <p className="text-sm text-slate-300 whitespace-pre-line">{message}</p>}
        {detail && <p className="text-xs text-slate-500 mt-2 whitespace-pre-line">{detail}</p>}
        <div className="flex gap-2 mt-5">
          {actions.map((a, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onClose(a.value)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition active:scale-[0.98] ${
                a.primary
                  ? 'bg-gradient-to-r from-cyan-400 to-cyan-500 text-black hover:brightness-110'
                  : 'border border-white/10 text-slate-400 hover:border-white/20 hover:text-white'
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ToastStack({ toasts }) {
  if (!toasts.length) return null;
  const colors = {
    info:    'border-cyan-500/30 text-cyan-100',
    success: 'border-emerald-500/30 text-emerald-100',
    warning: 'border-amber-500/30 text-amber-100',
    error:   'border-rose-500/30 text-rose-100',
  };
  return (
    <div className="fixed bottom-4 left-4 right-4 z-[110] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`px-4 py-2.5 rounded-xl border bg-[#0f0f18]/95 backdrop-blur text-sm ${colors[t.variant] || colors.info}`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
