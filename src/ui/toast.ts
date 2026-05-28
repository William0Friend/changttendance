/**
 * Slide-in toast notifications.
 * Variants: success, warning, error, info.
 */

type ToastVariant = 'success' | 'warning' | 'error' | 'info';

const COLORS: Record<ToastVariant, string> = {
  success: 'var(--success)',
  warning: 'var(--warning)',
  error:   'var(--danger)',
  info:    'var(--gold)',
};

export function showToast(
  message: string,
  variant: ToastVariant = 'info',
  duration = 4000,
): void {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.setAttribute('role', 'status');
  toast.style.cssText = `
    pointer-events: all;
    background: var(--surface);
    border: 1px solid ${COLORS[variant]};
    border-radius: 8px;
    padding: 10px 14px;
    font-family: var(--font-mono);
    font-size: .875rem;
    color: var(--text);
    max-width: 300px;
    word-break: break-word;
    box-shadow: var(--shadow);
    animation: toastIn .2s ease both;
    display: flex; align-items: flex-start; gap: 9px;
  `;

  const dot = document.createElement('span');
  dot.style.cssText = `
    display: inline-block; width: 8px; height: 8px; flex-shrink: 0;
    border-radius: 50%; background: ${COLORS[variant]}; margin-top: 4px;
  `;

  const text = document.createElement('span');
  text.textContent = message;

  toast.appendChild(dot);
  toast.appendChild(text);
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'toastOut .2s ease both';
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, duration);
}
