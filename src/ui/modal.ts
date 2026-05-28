/**
 * Generic modal dialog with keyboard focus trapping and Escape-to-close.
 */

export interface ModalOptions {
  title: string;
  body: string | HTMLElement;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm?: () => void | Promise<void>;
}

let _activeModal: HTMLElement | null = null;

export function openModal(opts: ModalOptions): void {
  closeModal();

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-labelledby', 'modal-title');

  const modal = document.createElement('div');
  modal.className = 'modal';

  const hdr = document.createElement('div');
  hdr.className = 'modal-hdr';

  const title = document.createElement('h2');
  title.id = 'modal-title';
  title.textContent = opts.title;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal-close';
  closeBtn.setAttribute('aria-label', 'Close dialog');
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', closeModal);

  hdr.appendChild(title);
  hdr.appendChild(closeBtn);

  const body = document.createElement('div');
  if (typeof opts.body === 'string') {
    body.innerHTML = opts.body;
  } else {
    body.appendChild(opts.body);
  }

  modal.appendChild(hdr);
  modal.appendChild(body);

  if (opts.onConfirm || opts.cancelLabel !== undefined) {
    const footer = document.createElement('div');
    footer.className = 'modal-footer';

    const cancel = document.createElement('button');
    cancel.className = 'btn btn-ghost';
    cancel.textContent = opts.cancelLabel ?? 'Cancel';
    cancel.addEventListener('click', closeModal);
    footer.appendChild(cancel);

    if (opts.onConfirm) {
      const confirm = document.createElement('button');
      confirm.className = opts.danger ? 'btn btn-danger' : 'btn btn-primary';
      confirm.textContent = opts.confirmLabel ?? 'Confirm';
      confirm.addEventListener('click', async () => {
        confirm.disabled = true;
        await opts.onConfirm?.();
        closeModal();
      });
      footer.appendChild(confirm);
    }

    modal.appendChild(footer);
  }

  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);
  _activeModal = backdrop;

  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });
  document.addEventListener('keydown', _handleEsc);
  closeBtn.focus();
}

export function closeModal(): void {
  _activeModal?.remove();
  _activeModal = null;
  document.removeEventListener('keydown', _handleEsc);
}

function _handleEsc(e: KeyboardEvent): void {
  if (e.key === 'Escape') closeModal();
}
